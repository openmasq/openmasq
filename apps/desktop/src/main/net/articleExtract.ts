import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

/**
 * ARTICLE extraction — the trafilatura-grade first stage of the HTML→text pipeline.
 * `@mozilla/readability` (the Firefox Reader Mode engine) over a `linkedom` parse:
 * on an ARTICLE page it drops what the string-scan cannot (cookie prose, "related
 * articles", comments, share bars) and keeps clean paragraph structure. PARSING only —
 * linkedom evaluates no script/style, and we return `textContent` exclusively (never
 * the extracted HTML), so nothing here can reach a DOM downstream.
 *
 * FAIL-CLOSED to the caller's string-scan (`htmlToText`): returns null whenever the
 * page is NOT an article (search results, listings, docs indexes — Readability is
 * poor there and the scan is the right tool), when the extract is too thin to be
 * trusted, or on ANY parse error. The caller must always have the fallback.
 */

/** Below this many characters, an "article" is more likely a mis-detected shell. */
const MIN_ARTICLE_CHARS = 800;

export function extractArticle(html: string, maxChars: number): string | null {
  if (!html || html.length < MIN_ARTICLE_CHARS) return null;
  try {
    const { document } = parseHTML(html);
    // `isProbablyReaderable` heuristic is bundled with Readability — cheap pre-gate
    // that spares the full parse on obvious non-articles.
    const article = new Readability(document as unknown as Document, {
      nbTopCandidates: 5,
      charThreshold: MIN_ARTICLE_CHARS,
    }).parse();
    const text = article?.textContent
      ?.replace(/[ \t\f\v ]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim();
    if (!text || text.length < MIN_ARTICLE_CHARS) return null;
    const title = article?.title?.trim();
    const body = title && !text.startsWith(title) ? `${title}\n${text}` : text;
    return body.length > maxChars ? body.slice(0, maxChars).trimEnd() + "\n…[tronqué]" : body;
  } catch {
    return null; // any parser hiccup → the string-scan fallback
  }
}
