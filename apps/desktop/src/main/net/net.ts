import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import Debug from "debug";
import { isPrivateIp } from "./privateIp";
import { noteEgressUrl } from "./egressLog";
import { contentTypeOk, readCapped, type FetchAccept } from "./body";

const debug = Debug("openmasq:net");

export { isPrivateIp };

/**
 * The SSRF guard: throw unless `url` targets a public host (internal hostnames blocked,
 * any hostname resolved and every address checked). Validates ONE host: the full download
 * path is `safeFetch` below, which calls this on every redirect hop.
 *
 * Every allow and refusal is journalled HERE, the one funnel every caller passes through
 * (browser navigate, a connector's hop 0, `safeFetch`, the Python egress proxy). Only the
 * ORIGIN is kept, never the path or query (a signed URL carries its token there).
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
  // addresses so the caller can PIN the connection to them (closes the DNS-rebinding
  // TOCTOU). A RESOLUTION failure is not a refusal: both are fail-closed, but the `code`
  // tells them apart so an outage never reads as a security decision.
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
 * The single choke point for downloading a semi-trusted URL: redirects followed MANUALLY
 * with `assertPublicUrl` on EVERY hop, Content-Type validated, body size-capped WHILE
 * streaming, hard timeout, http(s) only, optional per-host allow-list. Logs the host only.
 */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export interface SafeFetchOpts {
  /** Hard cap on the downloaded body (bytes), enforced while streaming. */
  maxBytes: number;
  /** Abort after this many ms. */
  timeoutMs: number;
  /** What the response must be: an HTML page, an image, any media file, a text/data
   *  document (`"text"` — the batch web reader), or a pinned binary artefact
   *  (`"binary"` — verified by its caller). The lists live in `body.ts`. */
  accept: FetchAccept;
  /** Stream the body here chunk by chunk instead of buffering it (`buf` comes back
   *  empty). The size cap still applies. For the one caller that writes a large,
   *  pinned artefact to disk while hashing it (`subscription/install/download.ts`). */
  sink?: (chunk: Uint8Array) => void;
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

// SECURITY: the outbound connection is PINNED to an IP already verified public, so `fetch`
// doesn't re-resolve the hostname (a TTL-0 rebinding record could hand a private IP to the
// connect). undici's `connect.lookup` hook; the hostname is kept so TLS SNI/cert validation
// is unchanged. `undici` is a DIRECT dependency so the control can't vanish on a dep bump;
// the import stays guarded (degrades to the per-hop re-check) rather than crashing main.

/**
 * The undici `connect.lookup` RESULT: its callback takes an ARRAY of `{address, family}`
 * (the `all:true` contract), not the 3-arg default — the wrong shape makes EVERY fetch
 * fail. ALL verified addresses, so undici can Happy-Eyeballs across them; each was checked
 * PUBLIC, so the pin holds. Exported for the regression test.
 */
export function verifiedLookupAddresses(verified: string[]): { address: string; family: number }[] {
  return verified.map((a) => ({ address: a, family: isIP(a) || 4 }));
}

let pinAgentFactory: ((addrs: string[]) => unknown) | null | undefined;
/** An undici dispatcher pinned to ALREADY-VERIFIED public addresses, for every main-side
 *  fetch that must resist DNS-rebinding. `undefined` when undici is unavailable (the caller
 *  falls back to a plain fetch, host still checked). `.close()` when done. */
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
      // Verify EVERY hop AND pin the connection to the verified IP.
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
      // Manual redirect: resolve Location against the current URL and loop.
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
      const buf = await readCapped(res, opts.maxBytes, opts.sink);
      debug("ok host=%s type=%s bytes=%d", u.hostname, contentType, buf.byteLength);
      return { finalUrl: current, buf, contentType };
    }
    throw new Error("Too many redirects");
  } finally {
    clearTimeout(timer);
    // Free the pinned dispatchers' sockets.
    for (const a of agents) {
      try {
        await a.close?.();
      } catch {
        /* noop */
      }
    }
  }
}
