import Debug from "debug";
import { safeFetch } from "./net";

const debug = Debug("openmasq:linkpreview");

/**
 * OpenGraph link-unfurl, run in MAIN. Fetches a URL's HTML (bounded), parses its
 * `og:*` / `twitter:*` meta tags with NO DOM and NO script execution, and — if it
 * advertises an image — downloads THAT image and returns it as a `data:` URL so
 * the renderer can show it without a remote request (the CSP blocks remote
 * `img-src`; the signed page/image URL never reaches the renderer or the model).
 *
 * SECURITY: every fetch (page AND image) goes through `safeFetch`, which blocks
 * private/loopback/metadata hosts at EVERY redirect hop, validates the
 * Content-Type, caps the size while streaming and enforces http(s) + a timeout.
 * This capability is OPT-IN (a user setting) because fetching a link necessarily
 * reveals the user's IP + the link to that third-party site.
 */
export interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  /** A `data:` URL (bytes fetched in main); never a remote URL. */
  image?: string;
  /** The site's icon as a `data:` URL — used as a blurred background fallback when
   *  there's no `og:image`. Bytes fetched in main; never a remote URL. */
  favicon?: string;
  siteName?: string;
}

const HTML_MAX = 512 * 1024; // enough for <head>; we don't need the whole page
const IMG_MAX = 8 * 1024 * 1024; // download cap
const DATA_URL_MAX = 2 * 1024 * 1024; // don't inline a huge image into the message
const FETCH_TIMEOUT = 10_000;

// Bounded in-memory cache so we don't refetch the same URL every render. Values
// include `null` (known-unpreviewable) to avoid retry storms.
const CACHE = new Map<string, LinkPreviewData | null>();
const CACHE_MAX = 200;
function cacheSet(url: string, v: LinkPreviewData | null): void {
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value as string);
  CACHE.set(url, v);
}

/** Decode the handful of HTML entities that show up in meta content. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&nbsp;/g, " ");
}

/** Pull a `<meta>` content value by property/name, scanning attributes in any
 *  order. Pure string scan — no DOM, so no scripts run. */
function metaContent(html: string, keys: string[]): string | undefined {
  const metaRe = /<meta\b[^>]*>/gi;
  for (const tag of html.match(metaRe) ?? []) {
    const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (!key || !keys.includes(key)) continue;
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
    if (content) return decodeEntities(content).trim();
  }
  return undefined;
}

function titleTag(html: string): string | undefined {
  const m = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : undefined;
}

/** Best site-icon href from `<link rel="…icon…">` tags, preferring a BIGGER icon
 *  (apple-touch-icon ~180px) over a tiny favicon so the blurred background reads.
 *  Pure string scan (no DOM). Returns undefined if none declared. */
function iconHref(html: string): string | undefined {
  const byRel: Record<string, string> = {};
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!rel || !href) continue;
    if (/\bicon\b/.test(rel) && !byRel[rel]) byRel[rel] = decodeEntities(href).trim();
  }
  return (
    byRel["apple-touch-icon"] ||
    byRel["apple-touch-icon-precomposed"] ||
    byRel["icon"] ||
    byRel["shortcut icon"] ||
    Object.values(byRel)[0]
  );
}

/** Fetch the og:image and inline it as a data: URL (dropped if too big / not an
 *  image / refused). */
async function fetchImageDataUrl(imageUrl: string): Promise<string | undefined> {
  try {
    const { buf, contentType } = await safeFetch(imageUrl, {
      source: "link-preview",
      accept: "image",
      maxBytes: IMG_MAX,
      timeoutMs: FETCH_TIMEOUT,
    });
    if (buf.byteLength > DATA_URL_MAX) return undefined; // keep the card text-only
    const ct = contentType || "image/jpeg";
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch (e) {
    debug("image fetch refused: %s", e instanceof Error ? e.message : "unknown");
    return undefined;
  }
}

/** Build a link-preview card for `url`, or null if nothing usable / refused.
 *  Never throws (best-effort — the caller shows nothing on null). */
export async function previewLink(url: string): Promise<LinkPreviewData | null> {
  if (CACHE.has(url)) return CACHE.get(url)!;
  let result: LinkPreviewData | null = null;
  try {
    const { finalUrl, buf } = await safeFetch(url, {
      source: "link-preview",
      accept: "html",
      maxBytes: HTML_MAX,
      timeoutMs: FETCH_TIMEOUT,
    });
    const html = buf.toString("utf8");
    const title = metaContent(html, ["og:title", "twitter:title"]) ?? titleTag(html);
    const description = metaContent(html, ["og:description", "twitter:description", "description"]);
    const siteName = metaContent(html, ["og:site_name"]);
    const rawImage = metaContent(html, ["og:image", "og:image:secure_url", "twitter:image"]);

    let image: string | undefined;
    if (rawImage) {
      const absolute = new URL(rawImage, finalUrl).toString();
      image = await fetchImageDataUrl(absolute);
    }
    // Only return a card if there's SOMETHING to show.
    if (title || description || image) {
      // The site icon powers the blurred background when there's no og:image — a
      // soft brand-coloured wash instead of flat grey. Best-effort (dropped on any
      // refusal); skip when we already have an og:image to use.
      let favicon: string | undefined;
      if (!image) {
        try {
          const iconUrl = new URL(iconHref(html) ?? "/favicon.ico", finalUrl).toString();
          favicon = await fetchImageDataUrl(iconUrl);
        } catch {
          /* invalid icon URL → no favicon */
        }
      }
      result = { url, title, description, image, favicon, siteName };
    }
  } catch (e) {
    debug("preview refused for host=%s: %s", safeHost(url), e instanceof Error ? e.message : "unknown");
    result = null;
  }
  cacheSet(url, result);
  return result;
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid";
  }
}
