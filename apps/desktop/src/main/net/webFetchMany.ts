import { safeFetch } from "./net";
import { htmlToText, HTML_TEXT_MAX } from "./htmlText";
import { extractArticle } from "./articleExtract";

/** TOTAL text budget for a batch (characters) — split across the pages. */
const TOTAL_TEXT_BUDGET = 32_000;
import { isAllowedBrowserUrl } from "../mcp/browserTools";

/**
 * The batch web reader: fetch SEVERAL URLs CONCURRENTLY and return each page's
 * readable text — the parallel alternative to driving the CDP agent browser one page
 * at a time. It rides the hardened `safeFetch` egress path (http(s) only, SSRF
 * re-checked on EVERY redirect hop with the connection IP-pinned, Content-Type
 * allow-listed to text/data, size-capped while streaming, timed out), and is
 * FAIL-CLOSED PER URL: a bad/blocked/oversize URL becomes one `{ok:false}` row, never
 * a thrown batch.
 *
 * Limits by construction (not incidental):
 *  - **No JavaScript.** `safeFetch` returns the raw HTML/data — a JS-rendered SPA
 *    yields little text (surfaced as `ok:false`, "rendue via JavaScript"). The CDP
 *    browser stays the tool for those.
 *  - **No cookies / no session.** `safeFetch` carries no credentials, so this can
 *    NEVER reach the user's authenticated pages — a meaningful narrowing vs the
 *    browser, which can.
 *  - Bounded fan-out (`maxUrls`) + concurrency (`concurrency`) + per-page bytes.
 *
 * The caller (the agent loop) un-redacts each URL (fake→real) BEFORE this runs — so a
 * search hits the REAL value — and re-redacted every returned string afterwards. This
 * module only fetches + extracts; it holds no vault. Pure but for `safeFetch` (which
 * is injectable for the unit tests). `webFetchMany.test.ts` pins the guards.
 */

export interface WebFetchItem {
  /** The requested URL (real, as passed in). */
  url: string;
  ok: boolean;
  /** After redirects — present on success. */
  finalUrl?: string;
  /** Extracted readable text — present on success. */
  text?: string;
  /** A SHORT, host-free reason — present on failure (never a raw URL/stack). */
  error?: string;
}

export interface WebFetchManyOpts {
  /** Injected for tests; defaults to the real hardened `safeFetch`. */
  fetchImpl?: typeof safeFetch;
  concurrency?: number;
  maxUrls?: number;
  maxBytes?: number;
  timeoutMs?: number;
}

const MAX_URLS = 8;
const CONCURRENCY = 5;
const PAGE_MAX_BYTES = 1024 * 1024; // 1 MB of HTML/data per page
const TIMEOUT_MS = 15_000;

/** Map a `safeFetch` throw to a bounded, HOST-FREE reason (defence in depth: the
 *  result is re-redacted downstream, but the error must not smuggle a raw URL out). */
function reasonOf(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/private|internal|metadata|loopback|non-http|allow-list/i.test(m)) return "adresse interne/privée ou schéma non autorisé";
  if (/too large/i.test(m)) return "réponse trop volumineuse";
  if (/Content-Type/i.test(m)) return "contenu non textuel (binaire, JS ou média)";
  if (/redirects/i.test(m)) return "trop de redirections";
  if (/abort|timeout/i.test(m)) return "délai dépassé";
  const status = m.match(/\((\d{3})\)/)?.[1];
  if (status) return `échec HTTP ${status}`;
  return "échec de récupération";
}

async function fetchOne(
  url: string,
  fetchImpl: typeof safeFetch,
  maxBytes: number,
  timeoutMs: number,
  maxText: number,
): Promise<WebFetchItem> {
  const u = url.trim();
  // Scheme floor (http/https only) — `about:blank` and non-web schemes are refused
  // up front; `safeFetch` re-runs the SSRF/scheme checks per hop regardless.
  if (!isAllowedBrowserUrl(u) || u.toLowerCase() === "about:blank") {
    return { url, ok: false, error: "URL refusée (http/https uniquement)" };
  }
  try {
    const { finalUrl, buf, contentType } = await fetchImpl(u, {
      accept: "text",
      maxBytes,
      timeoutMs,
      source: "web-fetch-many",
    });
    const raw = buf.toString("utf8");
    const isHtml = /^(?:text\/html|application\/xhtml)/i.test(contentType);
    // HTML → extracted readable text; text/data (JSON/CSV/plain/XML) → raw, bounded.
    // Stage 1: ARTICLE extraction (Readability) when the page is one — stage 2:
    // string scan (chrome-strip + main/article + budget), fail-closed fallback.
    const text = isHtml
      ? (extractArticle(raw, maxText) ?? htmlToText(raw, maxText))
      : raw.length > maxText
        ? raw.slice(0, maxText) + "\n…[tronqué]"
        : raw;
    return text.trim()
      ? { url, ok: true, finalUrl, text }
      : { url, ok: false, finalUrl, error: "aucun texte extractible (page vide ou rendue via JavaScript)" };
  } catch (e) {
    return { url, ok: false, error: reasonOf(e) };
  }
}

/** Run `fn` over `items` with at most `limit` in flight; preserves input order. */
async function runPool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const idx = next++;
      out[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return out;
}

/**
 * Fetch up to `maxUrls` (default {@link MAX_URLS}) of `urls` in parallel (default
 * concurrency {@link CONCURRENCY}). Non-string / blank entries are dropped; the rest
 * return one {@link WebFetchItem} each, in input order. Never throws.
 */
export async function webFetchMany(urls: unknown, opts: WebFetchManyOpts = {}): Promise<WebFetchItem[]> {
  const list = (Array.isArray(urls) ? urls : []).filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0,
  );
  // De-dupe (a model sometimes repeats a URL) while keeping order, then cap the count.
  const seen = new Set<string>();
  const capped = list.filter((u) => (seen.has(u) ? false : (seen.add(u), true))).slice(0, opts.maxUrls ?? MAX_URLS);
  if (!capped.length) return [];
  const fetchImpl = opts.fetchImpl ?? safeFetch;
  // TOTAL text budget SHARED across the batch: 4 pages at the full per-page cap put
  // ~20k tokens into ONE turn (measured) — the whole point of a batch read is breadth,
  // not 4 full dumps. One page keeps the full cap; N pages split a fixed pool, floor
  // 4k chars so a page is never truncated into uselessness.
  const perPage = Math.max(4_000, Math.min(HTML_TEXT_MAX, Math.floor(TOTAL_TEXT_BUDGET / capped.length)));
  return runPool(capped, opts.concurrency ?? CONCURRENCY, (u) =>
    fetchOne(u, fetchImpl, opts.maxBytes ?? PAGE_MAX_BYTES, opts.timeoutMs ?? TIMEOUT_MS, perPage),
  );
}
