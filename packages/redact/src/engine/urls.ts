/**
 * URL detection for the `url` redaction GATE (`RedactionCategory "url"`).
 *
 * When the "URL & liens" category is OFF (the default), NOTHING inside a URL is
 * redacted: a browsed / searched web page is full of image `src`s, CDN cache-busters
 * and asset ids whose path / key / name look-alikes flooded the audit ("détection de
 * sous-parties d'URL, néfaste"). We detect URL spans and the pipeline drops any
 * candidate whose value only ever occurs INSIDE one. When the category is ON there is
 * no suppression — URL sub-parts are detected like any other text.
 *
 * Pure + unit-tested; no Electron/DOM.
 */

// Unambiguous URLs: scheme URLs, protocol-relative `//host/…`, `www.…`. These span
// the WHOLE url, so any image filename / query token inside is covered automatically.
export const STRICT_URL = new RegExp(
  [
    String.raw`\b(?:https?|ftp|wss?):\/\/[^\s"'<>()\[\]]+`,
    String.raw`(?<![\w.])\/\/[a-z0-9][^\s"'<>()\[\]]+`,
    String.raw`\bwww\.[^\s"'<>()\[\]]+`,
  ].join("|"),
  "gi",
);

/**
 * The URL forms the REDACTION rule claims — a STRICT SUBSET of {@link STRICT_URL}.
 *
 * ⚠️ The two jobs pull in opposite directions and that is why they are two constants.
 * SUPPRESSION must be GENEROUS: catching one span too many only protects more of a
 * browsed page from being nibbled. REDACTION must be PRECISE: the protocol-relative
 * `//host…` alternative also matches the tail of `postgres://app:pw@db.internal`, so
 * including it made the URL rule claim a CONNECTION STRING and steal its far more
 * specific category (both still masked — but the journal then said "URL" about a
 * database credential). Scheme-bearing web URLs and `www.` only.
 */
export const ADDRESSED_URL = new RegExp(
  [
    String.raw`\b(?:https?|ftp|wss?):\/\/[^\s"'<>()\[\]]+`,
    String.raw`\bwww\.[^\s"'<>()\[\]]+`,
  ].join("|"),
  "gi",
);

// A scheme-less asset reference — a bare or rooted filename ending in a web extension:
// an <img src>/href value the browser snapshot lists WITHOUT its origin (`/GettyImages-
// …​.jpg`, `1783…-gettyimages-….jpeg`). The leading path (if any) is captured so the
// whole reference becomes a span. Whether it counts as a URL asset is then decided by
// `isAssetRef` — so a real user file (`/Users/x/photo.jpg`, `report.pdf`) is NOT caught.
const ASSET_REF = /(?<![\w])\/?(?:[\w-]+\/)*([\w-]+)\.([a-z0-9]{2,5})\b/gi;

// Purely-web static assets — never a user document, so always a URL asset.
const WEB_STATIC = new Set(["css", "js", "mjs", "map", "svg", "ico", "woff", "woff2"]);
// Image / media — a URL asset ONLY when the filename looks machine-generated (a real
// `/Users/x/photo.jpg` must stay a `path`, not be silently un-redacted).
const WEB_MEDIA = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "tif", "tiff", "mp4", "webm",
]);

/** A filename stem that reads as a machine-generated web asset, not a human name:
 *  very long, OR a long digit run (timestamp / id), OR several hyphen-joined tokens. */
function isAssetStem(stem: string): boolean {
  return stem.length >= 20 || /\d{6,}/.test(stem) || (stem.match(/-/g)?.length ?? 0) >= 2;
}

function isAssetRef(stem: string, ext: string): boolean {
  const e = ext.toLowerCase();
  if (WEB_STATIC.has(e)) return true;
  if (WEB_MEDIA.has(e)) return isAssetStem(stem);
  return false;
}

// A full email address `local@domain.tld`. Used to SUPPRESS a company/domain/name
// FRAGMENT candidate whose every occurrence sits inside an email (a NER-tagged
// "gmail" domain inside `x@gmail.com`): redacting it alone swaps only the domain and
// LEAKS the real local-part. The whole email is caught atomically by the email rule.
const EMAIL_SPAN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** All [start, end) spans of `text` that are a full email address. */
export function detectEmailSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const m of text.matchAll(EMAIL_SPAN)) {
    if (m.index != null) spans.push([m.index, m.index + m[0].length]);
  }
  return spans;
}

/** All [start, end) spans of `text` that are (part of) a URL or a web asset. */
export function detectUrlSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const m of text.matchAll(STRICT_URL)) {
    if (m.index != null) spans.push([m.index, m.index + m[0].length]);
  }
  for (const m of text.matchAll(ASSET_REF)) {
    if (m.index == null) continue;
    if (isAssetRef(m[1] ?? "", m[2] ?? "")) spans.push([m.index, m.index + m[0].length]);
  }
  return spans;
}

/**
 * The host of a URL span, lowercased and without its port / credentials — `""` when the
 * span carries none (a protocol-relative or `www.` form is handled by the callers below).
 */
function hostOf(url: string): string {
  const m = /^(?:[a-z][a-z0-9+.-]*:)?\/\/(?:[^/@\s]*@)?([^/:?#\s]+)/i.exec(url) ?? /^(www\.[^/:?#\s]+)/i.exec(url);
  return (m?.[1] ?? "").toLowerCase();
}

/**
 * The URL spans of `text` that address a host BELONGING to one of `hosts` — the domains
 * a service the user CONNECTED addresses its own resources on (`notion.com`,
 * `atlassian.net`, `vercel.app`…).
 *
 * ⚠️ This is an ALLOW-list, and it is the whole safety argument (rule 7). A page id, a
 * workspace slug and a `?pvs=1` in `https://app.notion.com/p/<id>` are Notion's ADDRESSING,
 * never the user's data — redacting them hands the model a link that resolves to nothing
 * and that it cannot feed back into `notion-fetch`. A URL on ANY other host gets no
 * exemption whatsoever, so an arbitrary browsed page is unaffected.
 *
 * Matching is on the registrable SUFFIX (`app.notion.com` ends with `.notion.com`), so a
 * look-alike host (`notion.com.evil.tld`) never matches — the suffix must terminate the
 * host. Callers pass hosts WITHOUT a leading dot.
 */
export function detectHostedUrlSpans(
  text: string,
  hosts: readonly string[],
): Array<[number, number]> {
  if (!hosts.length) return [];
  const suffixes = hosts.map((h) => h.trim().toLowerCase().replace(/^\.+/, "")).filter(Boolean);
  if (!suffixes.length) return [];
  const spans: Array<[number, number]> = [];
  for (const m of text.matchAll(STRICT_URL)) {
    if (m.index == null) continue;
    const host = hostOf(m[0]);
    if (!host) continue;
    if (suffixes.some((s) => host === s || host.endsWith(`.${s}`))) {
      spans.push([m.index, m.index + m[0].length]);
    }
  }
  return spans;
}

/**
 * A per-OCCURRENCE guard for the FORWARD vault passes (`applyVault` / `replayVault`):
 * true when THIS occurrence sits inside a URL span and must be left VERBATIM.
 *
 * ⚠️ Why the candidate filter is not enough. {@link occursOutsideUrl} decides per VALUE,
 * before anything is vaulted; it cannot help a value that is already IN the vault. Once
 * `app` is vaulted from ordinary prose (`packages/app`, « in-app »), every later tool
 * result has its `https://app.notion.com/…` and `…vercel.app` rewritten to the fake host —
 * the reported corruption. The two gates are complementary: the filter stops a URL-ONLY
 * value from ever being vaulted, this one stops an already-vaulted value from being
 * substituted INSIDE a URL.
 *
 * ⚠️ `isExempt` is what keeps this from being a leak, and it must FAIL CLOSED: a value
 * whose kind we cannot prove is exempt (i.e. still substituted), exactly like
 * `disabledVaultTokens`. Callers pass the `URL_EXEMPT_KINDS` test, so a key, a PAN, an
 * IBAN, an e-mail or a phone number in a query string is still redacted (audit H-3 + F2).
 *
 * The RESIDUAL this knowingly accepts: a non-exempt real value the conversation vaulted
 * (a company name, a place) reaches the model in clear when it appears inside a URL and
 * nowhere else in that text. That is the trade the URL gate already makes for detection;
 * this only makes the vault leg agree with it instead of corrupting the address.
 */
export type UrlOccurrenceGuard = (offset: number, length: number, value: string) => boolean;

export function urlOccurrenceGuard(
  spans: ReadonlyArray<readonly [number, number]>,
  isExempt: (value: string) => boolean,
): UrlOccurrenceGuard | undefined {
  if (!spans.length) return undefined;
  return (offset, length, value) => {
    if (isExempt(value)) return false;
    const end = offset + length;
    return spans.some(([s, e]) => offset < e && end > s);
  };
}

/**
 * True when `value` occurs at least once OUTSIDE every URL span — i.e. it is not
 * purely a URL fragment, so it should still be redacted even when the `url` category
 * is off. A value seen ONLY inside URLs (an image filename, a CDN token) returns
 * false and is suppressed. `spans` come from {@link detectUrlSpans} on the SAME text.
 */
export function occursOutsideUrl(
  value: string,
  text: string,
  spans: ReadonlyArray<readonly [number, number]>,
): boolean {
  if (!value) return true;
  let from = 0;
  for (;;) {
    const i = text.indexOf(value, from);
    if (i < 0) return false; // no (remaining) occurrence sat clear of a URL
    const end = i + value.length;
    // OVERLAP (not strict containment): a detector can over-match and swallow a word
    // adjoining the URL (FILE_RE joins "et 1783…​.jpeg"), so any overlap with a URL
    // span means this occurrence is URL-contaminated. Clear of every span ⇒ keep it.
    if (!spans.some(([s, e]) => i < e && end > s)) return true;
    from = i + 1;
  }
}
