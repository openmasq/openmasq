import { decodeHtmlEntities } from "@openmasq/connectors";
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

import { findElement, removeComments, removeElements, replaceAllTags, replaceNamedTags } from "./htmlScan";

/** Default cap on the extracted text per page (characters). */
export const HTML_TEXT_MAX = 20_000;


/** Block-level tags whose boundaries should become a line break, so the extracted
 *  text keeps paragraph/heading/list/row structure instead of running together. */
const BLOCK_TAGS: ReadonlySet<string> = new Set([
  "p", "div", "section", "article", "header", "footer", "main", "aside", "nav", "ul", "ol", "li",
  "table", "thead", "tbody", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre",
  "figure", "figcaption", "br", "hr",
]);
const READING_AREA_TAGS: ReadonlySet<string> = new Set(["main", "article"]);

/** Elements dropped WHOLE, inner text included, in this order. After the non-content
 *  elements comes the page CHROME whose inner text is never reading content — a `<select>`
 *  of 60 region `<option>`s or a `<nav>` link farm lands at the TOP of the extract, the most
 *  expensive spot for the model. `header` is KEPT (it often holds the h1); forms are kept (a
 *  forum's content can sit in one). */
const DROPPED_ELEMENTS = [
  "script", "style", "noscript", "svg", "head",
  "select", "nav", "footer", "iframe", "template", "button",
] as const;

/** The page's declared reading area: `<main>`'s content, else a SINGLE `<article>`. */
function readingArea(html: string): string | undefined {
  const main = findElement(html, "main");
  if (main) return html.slice(main.innerStart, main.innerEnd);
  const first = findElement(html, "article");
  if (!first || findElement(html, "article", first.end)) return undefined;
  return html.slice(first.start, first.end);
}

/**
 * Extract readable text from an HTML document. `max` caps the result (default
 * {@link HTML_TEXT_MAX}); the returned text is trimmed and whitespace-collapsed.
 * Every scan is linear in the input (`htmlScan.ts`): this runs in MAIN on fetched pages.
 */
export function htmlToText(html: string, max = HTML_TEXT_MAX): string {
  if (!html) return "";
  // MAIN-CONTENT first: when the page declares its reading area, extract THAT —
  // sidebars/related-links never compete with the content for the budget. Fallback to the
  // whole page when the candidate yields too little text (an empty shell `<main>` on a
  // JS-rendered app).
  const candidate = readingArea(html);
  if (candidate) {
    const focused = htmlToText(replaceNamedTags(candidate, READING_AREA_TAGS, " "), max);
    if (focused.length >= 500) return focused;
  }
  let stripped = removeComments(html);
  for (const name of DROPPED_ELEMENTS) stripped = removeElements(stripped, name);
  // Block boundaries → newlines, then every remaining tag → nothing.
  stripped = replaceAllTags(replaceNamedTags(stripped, BLOCK_TAGS, "\n"), " ");
  const text = decodeHtmlEntities(stripped)
    // Collapse spaces/tabs, then trim blank lines, keeping single newlines as breaks.
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    // Adjacent block elements each emit a break (open + close) — collapse any run of
    // newlines to a single one so the extract reads as one line per block.
    .replace(/\n{2,}/g, "\n")
    .trim();
  return text.length > max ? text.slice(0, max).trimEnd() + "\n…[tronqué]" : text;
}
