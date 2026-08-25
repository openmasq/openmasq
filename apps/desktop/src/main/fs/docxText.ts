/**
 * Reading and SURGICALLY editing the text of a .docx — pure string work on
 * `word/document.xml`, no zip, no XML DOM, so it is unit-testable on its own.
 *
 * WHY SURGICAL RATHER THAN REGENERATED. A .docx is a zip of XML parts. Rewriting only the
 * one part that holds the body, and re-zipping every other part byte-identically, preserves
 * styles, headers, footers, numbering, embedded images, charts and macros — not because a
 * library was careful, but because **we never rewrite them**. Regenerating the document from
 * a parsed model, by contrast, loses everything the model does not represent.
 *
 * ⚠️ THE TRAP THIS FILE EXISTS FOR: Word splits a sentence across several `<w:t>` runs at
 * every formatting boundary, so « Bonjour Marie » can be `<w:t>Bonjour </w:t><w:t>Marie</w:t>`.
 * Matching text run-by-run therefore misses most real sentences. We match on the PARAGRAPH's
 * concatenated text instead, and write the result back into its first run.
 *
 * Stated limitation, and it is a real one: per-run formatting INSIDE an edited paragraph is
 * flattened to the first run's. Everything outside that paragraph is untouched. That is the
 * trade a text edit makes here, and the tool description says so to the model.
 */

/** One paragraph, as the model reads it. */
export interface DocxParagraph {
  /** 1-based, so a model can say "paragraphe 3" and mean the third one. */
  index: number;
  text: string;
}

const PARA = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>|<w:p(?:\s[^>]*)?\/>/g;
const RUN_TEXT = /<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:t(?:\s[^>]*)?\/>/g;

/** XML entities Word actually emits. Order matters: `&amp;` last on encode, first on decode. */
export function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
export function encodeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** The visible text of one `<w:p>` block: its runs, concatenated and decoded. */
function paragraphText(block: string): string {
  let out = "";
  for (const m of block.matchAll(RUN_TEXT)) out += decodeXml(m[2] ?? "");
  return out;
}

/** Every paragraph of the body, in order. Empty ones are KEPT: they are the document's
 *  blank lines, and dropping them would renumber everything the model refers to. */
export function docxParagraphs(xml: string): DocxParagraph[] {
  return [...xml.matchAll(PARA)].map((m, i) => ({ index: i + 1, text: paragraphText(m[0]) }));
}

/** The whole document as plain text — what `read_document` hands the model. */
export function docxToText(xml: string): string {
  return docxParagraphs(xml)
    .map((p) => p.text)
    .join("\n");
}

/**
 * Replace `oldText` with `newText` in the ONE paragraph that contains it.
 *
 * Fail-closed on every ambiguity, exactly like the plain-text `applyEdit`: absent, present
 * in several paragraphs, or an empty search all THROW rather than guess. A document edited
 * at the wrong place is worse than one not edited.
 */
export function applyDocxEdit(
  xml: string,
  oldText: string,
  newText: string,
): { xml: string; paragraph: number } {
  if (!oldText) throw new Error("`oldText` ne peut pas être vide");
  if (oldText === newText) throw new Error("`oldText` et `newText` sont identiques");

  const blocks = [...xml.matchAll(PARA)];
  const hits = blocks
    .map((m, i) => ({ m, i, text: paragraphText(m[0]) }))
    .filter((b) => b.text.includes(oldText));

  if (hits.length === 0) {
    throw new Error(
      `texte introuvable dans le document : « ${oldText.slice(0, 60)} » — relisez-le, ` +
        `Word coupe les phrases en fragments et le texte doit correspondre à un paragraphe entier`,
    );
  }
  if (hits.length > 1) {
    throw new Error(
      `« ${oldText.slice(0, 60)} » apparaît dans ${hits.length} paragraphes — ` +
        `donnez un extrait plus long pour lever l'ambiguïté`,
    );
  }

  const hit = hits[0];
  const updated = hit.text.replace(oldText, newText);
  const rewritten = writeParagraphText(hit.m[0], updated);
  const start = hit.m.index ?? 0;
  return {
    xml: xml.slice(0, start) + rewritten + xml.slice(start + hit.m[0].length),
    paragraph: hit.i + 1,
  };
}

/**
 * Put `text` into a paragraph block: everything goes into the FIRST run, the others are
 * emptied (not removed — deleting a run would drop the properties Word attaches to it).
 *
 * `xml:space="preserve"` is forced on that run: without it Word collapses leading and
 * trailing spaces, so « Total :  » silently loses its alignment.
 */
function writeParagraphText(block: string, text: string): string {
  let first = true;
  const out = block.replace(RUN_TEXT, (whole, attrs: string | undefined) => {
    // A self-closing `<w:t/>` has no capture group 2 — it still counts as a run.
    if (!first) return whole.startsWith("<w:t") && whole.endsWith("/>") ? whole : `<w:t${attrs ?? ""}></w:t>`;
    first = false;
    const keep = (attrs ?? "").replace(/\s*xml:space="[^"]*"/, "");
    return `<w:t${keep} xml:space="preserve">${encodeXml(text)}</w:t>`;
  });
  // A paragraph with no run at all (a bare `<w:p/>`) cannot receive text without inventing
  // run properties — refuse rather than fabricate a run whose formatting we guessed.
  if (first) throw new Error("ce paragraphe ne contient aucun texte modifiable");
  return out;
}
