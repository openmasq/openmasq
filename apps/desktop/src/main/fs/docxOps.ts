import { readFile, stat } from "node:fs/promises";
import { applyDocxEdit, docxToText } from "./docxText";
import type { Grant } from "./grant";

/**
 * The MODEL's two Word tools, on top of the pure `docxText.ts`.
 *
 * A .docx is a zip of XML parts; only `word/document.xml` holds the body. We rewrite THAT
 * part and re-zip every other one byte-identically, so styles, headers, footers, numbering,
 * images, charts and macros survive — not because a library preserved them, but because we
 * never touched them. It is the same doctrine as the CSV editor: patch the source, never
 * re-serialise a parsed model.
 *
 * ⚠️ The write goes through the SAME `atomicWrite` discipline as every other fs write (a
 * temp file renamed over the target), so an interrupted save cannot leave a half-written
 * document. The caller passes it in rather than this module importing it, to keep the zip
 * work testable on its own.
 */
const BODY_PART = "word/document.xml";
/** A document body is XML; past this something is wrong, and inflating it would be a way to
 *  make the worker chew memory on a crafted file. */
const MAX_BODY = 8_000_000;

/** Read + inflate the body part of a .docx. */
async function readBody(path: string): Promise<{ zip: Record<string, Uint8Array>; xml: string }> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const zip = unzipSync(await readFile(path));
  const part = zip[BODY_PART];
  if (!part) throw new Error("ce fichier n'est pas un document Word lisible (word/document.xml absent)");
  if (part.byteLength > MAX_BODY) throw new Error("document trop volumineux");
  return { zip, xml: strFromU8(part) };
}

export type DocxOp = (
  g: Grant,
  a: Record<string, unknown>,
  write: (path: string, bytes: Uint8Array) => Promise<void>,
) => Promise<string>;

const str = (a: Record<string, unknown>, k: string): string => {
  const v = a[k];
  if (typeof v !== "string") throw new Error(`argument \`${k}\` requis (chaîne)`);
  return v;
};

export const DOCX_OPS: Record<string, DocxOp> = {
  /** The document as plain text, paragraph per line — what the model reads before editing. */
  async read_document(g, a) {
    const p = g.resolve(str(a, "path"));
    const st = await stat(p);
    if (!st.isFile()) throw new Error("ce chemin n'est pas un fichier");
    const { xml } = await readBody(p);
    const text = docxToText(xml);
    // Saying the paragraph count is not decoration: the model edits by quoting a whole
    // paragraph, so it needs to know that a line here IS one.
    const lines = text.split("\n").length;
    return `[document Word · ${lines} paragraphe(s) · un par ligne]\n${text}`;
  },

  /**
   * Replace one passage. Fail-closed on ambiguity (`docxText.ts`), and the ENTIRE rest of
   * the package is copied through untouched.
   */
  async edit_document(g, a, write) {
    const p = g.resolve(str(a, "path"));
    const { zipSync, strToU8 } = await import("fflate");
    const { zip, xml } = await readBody(p);
    const { xml: next, paragraph } = applyDocxEdit(xml, str(a, "oldText"), str(a, "newText"));

    // Re-zip: every part is passed through as the SAME bytes we read, except the body.
    const out: Record<string, Uint8Array> = {};
    for (const [name, bytes] of Object.entries(zip)) out[name] = bytes;
    out[BODY_PART] = strToU8(next);
    await write(p, zipSync(out));

    return `Modifié ${p} — paragraphe ${paragraph} réécrit ; le reste du document est inchangé.`;
  },
};
