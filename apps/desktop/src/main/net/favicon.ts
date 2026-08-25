import { safeFetch } from "./net";

// Content-types allowed for a favicon rendered in an <img> under the app CSP — RASTER
// ONLY. `image/svg+xml` is deliberately EXCLUDED: an SVG can carry scripts / external
// refs, and the codebase convention is "raster only, no SVG" (components/CLAUDE.md,
// ooxml/media.ts) — a belt-and-suspenders even though an <img>-loaded SVG can't script.
const FAVICON_RASTER_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/apng",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

/**
 * Fetch a site favicon as a `data:` URL, hardened for an UNTRUSTED, page-declared icon
 * URL (an agent-browser tab's `<link rel=icon>` — the page is arbitrary/prompt-injected
 * web content). Every guard `safeFetch` gives applies — SSRF (private/internal hosts
 * blocked at every redirect hop, IP-pinned against DNS rebinding), http(s)-only, a hard
 * body size cap, a timeout — PLUS a RASTER-ONLY content-type check so an SVG / HTML /
 * unknown payload can never reach the renderer. Returns `null` on ANY failure or a
 * non-raster type (the caller falls back to the letter tile). The bytes come back as a
 * `data:` URL because the renderer CSP has no wildcard `img-src` (host/CLAUDE.md).
 *
 * Runs in the ISOLATED agent-browser child (never main), the process that already faces
 * the web. No credentials ride the fetch (a node GET, no cookies), so it can't pull an
 * authenticated-only icon — that just yields the letter fallback.
 */
export async function fetchFaviconDataUrl(url: string): Promise<string | null> {
  try {
    if (!/^https?:$/.test(new URL(url).protocol)) return null;
    const { buf, contentType } = await safeFetch(url, {
      source: "browser-favicon",
      accept: "image",
      maxBytes: 128 * 1024, // a favicon is tiny; a hard cap defeats a decompression bomb
      timeoutMs: 5000,
    });
    const ct = contentType.split(";")[0].trim().toLowerCase();
    if (!FAVICON_RASTER_TYPES.has(ct) || buf.byteLength === 0) return null;
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null; // SSRF-refused / too big / wrong type / network error → no favicon
  }
}
