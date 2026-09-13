/**
 * The ONE network fetch the bake scripts use, and the only reason it exists: the hosts
 * they pull from rate-limit.
 *
 * ⚠️ The Windows preflight of 13/09/2026 died on a bare `HTTP 429` from Hugging Face,
 * AFTER the 404 MB Python runtime had already been built — every minute of the job spent,
 * and nothing wrong with the code. A release would have failed the same way, at the same
 * point, for the same non-reason. All four bake scripts called `fetch` naked, so all four
 * could do it, and `pnpm bake` runs them in sequence.
 *
 * ⛔ Only the TRANSPORT is retried. Every caller verifies a sha256 afterwards, and that
 * gate is untouched: bytes that arrive and do not match are a refusal, never grounds for
 * asking again more politely.
 */

/** Statuses worth another go: the host is rate-limiting or temporarily unwell. */
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
const ATTEMPTS = 5;

type Opts = { attempts?: number; log?: (message: string) => void; sleep?: (ms: number) => Promise<void> };

const doze = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The host's own `Retry-After` when it gives one, else 2 s, 4 s, 8 s, 16 s. */
export function backoffMs(attempt: number, retryAfter?: string | null): number {
  const asked = Number(retryAfter);
  return Number.isFinite(asked) && asked > 0 ? Math.min(asked * 1000, 60_000) : 2 ** attempt * 1000;
}

/** Fetch `url`, retrying a rate-limit or a transport failure. Resolves only on a 2xx. */
export async function fetchWithRetry(url: string, init?: RequestInit, opts: Opts = {}): Promise<Response> {
  const attempts = opts.attempts ?? ATTEMPTS;
  const sleep = opts.sleep ?? doze;
  let last = "";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (e) {
      // DNS, a reset connection, a TLS hiccup — all worth one more go.
      last = `${(e as Error).message} for ${url}`;
      if (attempt === attempts) break;
      opts.log?.(`${last} — retrying in ${Math.round(backoffMs(attempt) / 1000)} s (${attempt + 1}/${attempts})`);
      await sleep(backoffMs(attempt));
      continue;
    }
    if (res.ok) return res;
    last = `HTTP ${res.status} for ${url}`;
    if (!RETRYABLE.has(res.status) || attempt === attempts) break;
    const ms = backoffMs(attempt, res.headers.get("retry-after"));
    opts.log?.(`${last} — retrying in ${Math.round(ms / 1000)} s (${attempt + 1}/${attempts})`);
    await sleep(ms);
  }
  throw new Error(`${last} (after ${attempts} attempt(s))`);
}

/** The same, for the callers that just want the bytes. */
export async function fetchBytes(url: string, opts: Opts = {}): Promise<Uint8Array> {
  const res = await fetchWithRetry(url, { redirect: "follow" }, opts);
  return new Uint8Array(await res.arrayBuffer());
}
