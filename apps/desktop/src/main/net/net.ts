import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import Debug from "debug";
import { isPrivateIp } from "./privateIp";
import { noteEgressUrl } from "./egressJournal";

const debug = Debug("openmasq:net");

export { isPrivateIp };

/**
 * SSRF guard for `files:fetch-url`: the URL comes from a connected MCP server's
 * tool result (semi-trusted), so before `main` downloads it we make sure it can't
 * be pointed at the local machine or a private network (cloud metadata endpoints,
 * `localhost`, LAN hosts…). Only literal-host ranges + the resolved DNS address of
 * a hostname are checked here; `assertPublicUrl` does the resolution.
 *
 * Note: this validates ONE host. For the full download path (redirects re-checked
 * per hop, Content-Type + size validated) use `safeFetch` below, which calls this
 * on every hop — that's what closes the redirect-to-internal-IP vector.
 */

/**
 * Throw unless `url` targets a public host. Blocks obvious internal hostnames and
 * resolves any hostname to reject private/loopback/link-local/reserved addresses.
 *
 * Every allow and every refusal is journalled here rather than at the call sites, because
 * this is the one funnel they all pass through — the browser's navigate, a connector's hop
 * 0, `safeFetch`'s per-hop re-check, the Python egress proxy. `source` names the caller for
 * the user-facing record and defaults to `unknown`; only the ORIGIN is kept, never the path
 * or query (a signed export URL carries its token there). See `egressJournal.ts`.
 */
export async function assertPublicUrl(url: string, source = "unknown"): Promise<string[]> {
  try {
    const verified = await resolvePublicUrl(url);
    noteEgressUrl(url, source, "allowed");
    return verified;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    noteEgressUrl(url, source, "refused", code === "EDNS_UNRESOLVED" ? "DNS failure" : "non-public host");
    throw e;
  }
}

async function resolvePublicUrl(url: string): Promise<string[]> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  const lower = host.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local")) {
    throw new Error(`Refused internal host: ${host}`);
  }
  // Literal IP → check directly (no DNS). The verified address IS the host.
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error(`Refused private address: ${host}`);
    return [host];
  }
  // Hostname → resolve and reject if ANY address is non-public. Returns the VERIFIED
  // addresses so the caller can PIN the connection to them (audit M-7: closes the
  // DNS-rebinding TOCTOU — otherwise `fetch` re-resolves and could hit a private IP).
  //
  // A RESOLUTION failure is not a refusal: the caller must stay fail-closed either way,
  // but the two must be tellable apart — a Wi-Fi blip reported as "private address
  // blocked" reads as a security decision and sends the model (and the user) chasing a
  // block that never was. The `code` is the contract; the message is for humans.
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    const err = new Error(
      `Unresolved host (network/DNS failure): ${host}`,
    ) as NodeJS.ErrnoException;
    err.code = "EDNS_UNRESOLVED";
    throw err;
  }
  for (const { address } of addrs) {
    if (isPrivateIp(address)) {
      throw new Error(`Refused host resolving to a private address: ${host}`);
    }
  }
  return addrs.map((a) => a.address);
}

/* ─── Hardened fetch ─────────────────────────────────────────────────────────
 * A single choke point for downloading a URL that came from a semi-trusted place
 * (a tool result, or a link a user/model pasted). It closes the SSRF holes the
 * bare `assertPublicUrl` left open:
 *   • redirects are followed MANUALLY and `assertPublicUrl` re-runs on EVERY hop
 *     (a public host that 302s to 169.254.169.254 / a LAN IP is now blocked),
 *   • the Content-Type is validated against what the caller expects,
 *   • the body is size-capped WHILE streaming (never buffers an unbounded blob),
 *   • a hard timeout + http(s)-only + an optional per-host allow-list.
 * Never logs the full URL (a signed export URL can carry a token) — host only.
 */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const MEDIA_CONTENT_TYPES = [
  "image/",
  "application/pdf",
  "video/mp4",
  "text/csv",
  "application/zip",
  "application/octet-stream", // some signed-export hosts mislabel binaries
  "application/vnd.openxmlformats-officedocument.", // pptx/docx/xlsx
];

// `accept:"text"` — the batch web reader (`webFetchMany.ts`) accepts a page or a
// text-shaped DATA response. Non-executable types only: NO `application/javascript`
// (the reader never runs it, and refusing it keeps the accept honest — we fetch
// documents/data, not code). Everything is still http(s), SSRF-checked per hop,
// size-capped and timed out exactly like the other accepts.
const TEXT_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/tab-separated-values",
  "application/json",
  "text/xml",
  "application/xml",
  "application/rss+xml",
  "application/atom+xml",
];

export interface SafeFetchOpts {
  /** Hard cap on the downloaded body (bytes), enforced while streaming. */
  maxBytes: number;
  /** Abort after this many ms. */
  timeoutMs: number;
  /** What the response must be: an HTML page, an image, any media file, or a
   *  text/data document (`"text"` — the batch web reader; see TEXT_CONTENT_TYPES). */
  accept: "html" | "image" | "media" | "text";
  /** Optional defence-in-depth: the host (initial AND every redirect hop) must
   *  match one of these suffixes, else the fetch is refused. */
  allowHosts?: string[];
  /** Max redirect hops to follow (default 4). */
  maxRedirects?: number;
  /** Which subsystem is fetching — recorded in the egress journal, per hop. */
  source?: string;
}

export interface SafeFetchResult {
  /** The URL actually fetched (after redirects). */
  finalUrl: string;
  buf: Buffer;
  contentType: string;
}

function hostAllowed(host: string, allow: string[]): boolean {
  const h = host.toLowerCase();
  return allow.some((a) => h === a.toLowerCase() || h.endsWith("." + a.toLowerCase()));
}

function contentTypeOk(ct: string, accept: SafeFetchOpts["accept"]): boolean {
  const t = ct.split(";")[0].trim().toLowerCase();
  if (accept === "html") return t === "text/html" || t === "application/xhtml+xml";
  if (accept === "image") return t.startsWith("image/");
  if (accept === "text") return TEXT_CONTENT_TYPES.includes(t);
  return MEDIA_CONTENT_TYPES.some((p) => t.startsWith(p));
}

/** Read a response body into a Buffer, aborting if it exceeds `maxBytes`. */
async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("Response too large");
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error("Response too large");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/**
 * Download `url` safely. See the block comment above for the guarantees. Throws
 * on any refusal (private host at any hop, bad protocol, disallowed host, wrong
 * Content-Type, oversize, timeout, non-2xx).
 */
// SECURITY (audit M-7): pin the outbound connection to an IP we ALREADY verified is
// public, so undici (`fetch`) doesn't re-resolve the hostname — a DNS-rebinding record
// with TTL 0 could otherwise return a public IP to `assertPublicUrl` and a private one
// to the actual connect. Uses undici's `connect.lookup` hook; the URL hostname is kept
// so TLS SNI/cert validation is unchanged. `undici` is a DIRECT dependency of
// apps/desktop (package.json) so this control can't silently disappear on a dep bump;
// the dynamic import stays guarded (degrades to the per-hop `assertPublicUrl` re-check)
// as belt-and-suspenders against a load failure rather than crashing main.
/**
 * The undici `connect.lookup` RESULT for a set of already-verified public addresses.
 * undici's custom lookup follows the `dns.lookup(host, {all:true})` contract — its callback
 * takes an ARRAY of `{address, family}`, NOT the 3-arg `(err, address, family)` dns.lookup
 * default. Passing the 3-arg form makes undici read `address` as `undefined` → "Invalid IP
 * address: undefined" → EVERY `safeFetch` throws `fetch failed` (agent-browser favicons, link
 * previews and file fetches all silently dead). We return ALL verified addresses so undici can
 * Happy-Eyeballs across them (pinning only the first would dead-end on an unreachable IPv6-only
 * record); each was already checked PUBLIC by `assertPublicUrl`, so the rebinding pin holds —
 * undici may connect ONLY to a verified address. Exported for the regression test.
 */
export function verifiedLookupAddresses(verified: string[]): { address: string; family: number }[] {
  return verified.map((a) => ({ address: a, family: isIP(a) || 4 }));
}

let pinAgentFactory: ((addrs: string[]) => unknown) | null | undefined;
/** An undici dispatcher pinned to a set of ALREADY-VERIFIED public addresses — reused by
 *  `safeFetch` and by any other main-side fetch that must resist DNS-rebinding (the
 *  embeddings POST). Returns `undefined` when undici is unavailable (caller falls back to a
 *  plain fetch, whose host was still `assertPublicUrl`-checked). Close `.close()` when done. */
export async function pinnedDispatcher(addrs: string[]): Promise<{ close?: () => Promise<void> } | undefined> {
  if (!addrs.length) return undefined;
  if (pinAgentFactory === undefined) {
    try {
      const { Agent } = (await import("undici")) as { Agent: new (o: unknown) => unknown };
      pinAgentFactory = (verified) =>
        new Agent({
          connect: {
            lookup: (
              _hostname: string,
              _o: unknown,
              cb: (err: Error | null, addresses: { address: string; family: number }[]) => void,
            ) => cb(null, verifiedLookupAddresses(verified)),
          },
        });
    } catch {
      pinAgentFactory = null; // undici unavailable → no pinning (per-hop re-check stands)
    }
  }
  return pinAgentFactory ? (pinAgentFactory(addrs) as { close?: () => Promise<void> }) : undefined;
}

export async function safeFetch(url: string, opts: SafeFetchOpts): Promise<SafeFetchResult> {
  const maxRedirects = opts.maxRedirects ?? 4;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  const agents: { close?: () => Promise<void> }[] = [];
  try {
    let current = url;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const u = new URL(current);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new Error(`Refused non-http(s) URL: ${u.protocol}`);
      }
      if (opts.allowHosts && !hostAllowed(u.hostname, opts.allowHosts)) {
        throw new Error(`Refused host not in allow-list: ${u.hostname}`);
      }
      // Verify EVERY hop (the redirect-SSRF fix) AND pin the connection to the verified
      // IP (audit M-7, DNS-rebinding TOCTOU) when undici is available.
      const verified = await assertPublicUrl(current, opts.source ?? "safe-fetch");
      const dispatcher = await pinnedDispatcher(verified);
      if (dispatcher) agents.push(dispatcher as { close?: () => Promise<void> });
      const init: RequestInit & { dispatcher?: unknown } = {
        signal: controller.signal,
        redirect: "manual",
        headers: { "User-Agent": BROWSER_UA },
      };
      if (dispatcher) init.dispatcher = dispatcher;
      const res = await fetch(current, init);
      // Manual redirect handling: resolve Location against the current URL and loop.
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        const next = new URL(res.headers.get("location")!, current).toString();
        debug("redirect %d %s → hop=%d", res.status, u.hostname, hop + 1);
        await res.body?.cancel().catch(() => {});
        current = next;
        continue;
      }
      if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
      const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
      if (!contentTypeOk(contentType, opts.accept)) {
        await res.body?.cancel().catch(() => {});
        throw new Error(`Refused Content-Type '${contentType}' for accept='${opts.accept}'`);
      }
      const buf = await readCapped(res, opts.maxBytes);
      debug("ok host=%s type=%s bytes=%d", u.hostname, contentType, buf.byteLength);
      return { finalUrl: current, buf, contentType };
    }
    throw new Error("Too many redirects");
  } finally {
    clearTimeout(timer);
    // Free the pinned dispatchers' sockets (bodies are already read/cancelled by here).
    for (const a of agents) {
      try {
        await a.close?.();
      } catch {
        /* noop */
      }
    }
  }
}
