/**
 * HTML → bounded PLAIN TEXT, by string scan — NO DOM, NO script execution (same
 * discipline as `linkPreview.ts`'s meta parsing). Used by `webFetchMany.ts` to hand
 * the model a page's readable text without driving the CDP browser.
 *
 * This never builds HTML and never reaches the renderer: the output is plain text the
 * model reads (and which is then re-redacted), so there is no sanitiser/XSS surface —
 * a stray `<script>` here would only ever be stripped, never run. We drop the
 * non-content elements (`script`/`style`/`noscript`/`svg`/`head`, plus the page
 * CHROME: `select`/`nav`/`footer`/`iframe`/`template`/`button`), turn block-level
 * tags into line breaks, strip the rest, decode the common entities, collapse runs of
 * whitespace, and CAP the length (a model context is finite; an un-capped scrape of a
 * 5 MB page is useless and expensive). Pure + unit-tested.
 */

/** Default cap on the extracted text per page (characters). */
export const HTML_TEXT_MAX = 20_000;

/** Decode the HTML entities that survive tag-stripping (named + numeric). */
function decodeEntities(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+);/gi, (_m, code: string) => {
      const cp = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      // Reject out-of-range / control code points → keep the raw entity rather than
      // emit U+FFFD noise or throw.
      return Number.isFinite(cp) && cp >= 0x20 && cp <= 0x10ffff ? safeFromCodePoint(cp) : _m;
    })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&(?:apos|#0*39);/gi, "'")
    .replace(/&nbsp;/g, " ");
}

function safeFromCodePoint(cp: number): string {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "";
  }
}

/** Block-level tags whose boundaries should become a line break, so the extracted
 *  text keeps paragraph/heading/list/row structure instead of running together. */
const BLOCK_TAG =
  /<\/?(?:p|div|section|article|header|footer|main|aside|nav|ul|ol|li|table|thead|tbody|tr|h[1-6]|blockquote|pre|figure|figcaption|br|hr)\b[^>]*>/gi;

/**
 * Extract readable text from an HTML document. `max` caps the result (default
 * {@link HTML_TEXT_MAX}); the returned text is trimmed and whitespace-collapsed.
 */
export function htmlToText(html: string, max = HTML_TEXT_MAX): string {
  if (!html) return "";
  // MAIN-CONTENT first: when the page declares its reading area (`<main>`, else a
  // SINGLE `<article>`), extract THAT — sidebars/related-links never compete with the
  // content for the budget. Fallback to the whole page when the candidate yields too
  // little text (an empty shell `<main>` on a JS-rendered app).
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1];
  const articles = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/gi);
  const candidate = main ?? (articles?.length === 1 ? articles[0] : undefined);
  if (candidate) {
    const focused = htmlToText(candidate.replace(/<\/?(?:main|article)\b[^>]*>/gi, " "), max);
    if (focused.length >= 500) return focused;
  }
  const stripped = html
    // Drop non-content elements WHOLE (including their inner text).
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, " ")
    // Page CHROME whose inner text is never reading content — a `<select>` of 60
    // region `<option>`s or a `<nav>` link farm lands at the TOP of the extract,
    // the most expensive spot for the model (mesuré : la page de résultats DDG
    // ouvrait sur 60 lignes de pays avant le premier résultat). `header` is KEPT
    // (it often holds the h1); forms are kept (a forum's content can sit in one).
    .replace(/<select\b[^>]*>[\s\S]*?<\/select>/gi, " ")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, " ")
    .replace(/<button\b[^>]*>[\s\S]*?<\/button>/gi, " ")
    // Block boundaries → newlines (before the generic tag strip below).
    .replace(BLOCK_TAG, "\n")
    // Every remaining tag → nothing.
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(stripped)
    // Collapse spaces/tabs, then trim blank lines, keeping single newlines as breaks.
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    // Adjacent block elements each emit a break (open + close) — collapse any run of
    // newlines to a single one so the extract reads as one line per block.
    .replace(/\n{2,}/g, "\n")
    .trim();
  return text.length > max ? text.slice(0, max).trimEnd() + "\n…[tronqué]" : text;
}
