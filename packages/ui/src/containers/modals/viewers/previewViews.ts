import type { Messages } from "@openmasq/i18n";
import type { DocView, DocViewOption } from "./DocViewMenu";

/**
 * **What can this attachment show, and which layer opens first.** Pure, so the decision
 * that was wrong is now the decision that is tested.
 *
 * ⚠️ The bug it exists to pin: the rich views were gated on `file.path`, and there are
 * TWO byte routes. A NATIVE pick carries a `path` the read gate has granted; a DROP or a
 * Bibliothèque RE-ATTACH carries the bytes inline as `data` and has **no path by design**
 * — handing a dropped path to main would be an arbitrary-disk-read primitive for a
 * renderer XSS (`pages/ChatWorkspace/dropIntake.ts`). So every dropped document silently
 * downgraded to its extracted TEXT: a spreadsheet came back as rows of characters instead
 * of a grid, and « Feuille » was not even offered. Ask `hasBytes`, never `path`.
 */

const SHEET = /\.(xlsx|xlsm|xls|ods|csv|tsv)$/i;
const CSV = /\.(csv|tsv)$/i;
const DOCX = /\.docx$/i;
const PPTX = /\.pptx$/i;
const MD = /\.(md|markdown|mdown|mkd|mdx)$/i;
const IMG = /^image\/|\.(png|jpe?g|webp|bmp|tiff?|gif|avif)$/i;

export interface PreviewFile {
  name: string;
  text: string;
  kind: string;
  mime?: string;
  path?: string;
  data?: string;
  ocrText?: string;
}

export interface PreviewShape {
  isPdf: boolean;
  isSheet: boolean;
  /** A DELIMITED sheet — the parser needs telling, `.xls*` is a zip/binary. */
  isCsv: boolean;
  isDocx: boolean;
  isPptx: boolean;
  isMd: boolean;
  isImage: boolean;
  /** A format whose "document" view is a rendered one (sheet / docx / pptx). */
  isRich: boolean;
  /** The file ITSELF is renderable — from a granted path OR from bytes in memory. */
  hasBytes: boolean;
  /** The always-OCR second layer, when it says something the text layer doesn't. */
  hasOcrLayer: boolean;
}

export function previewShape(file: PreviewFile): PreviewShape {
  const isSheet = file.kind === "xlsx" || file.kind === "csv" || SHEET.test(file.name);
  const isDocx = file.kind === "docx" || DOCX.test(file.name);
  const isPptx = file.kind === "pptx" || PPTX.test(file.name);
  const ocr = (file.ocrText ?? "").trim();
  return {
    isPdf: file.kind === "pdf" || /\.pdf$/i.test(file.name),
    isSheet,
    isCsv: CSV.test(file.name),
    isDocx,
    isPptx,
    isMd: file.kind === "markdown" || MD.test(file.name),
    isImage: file.kind === "image" || IMG.test(file.mime ?? "") || IMG.test(file.name),
    isRich: isSheet || isDocx || isPptx,
    hasBytes: !!file.path || !!file.data,
    hasOcrLayer: ocr.length > 0 && ocr !== file.text.trim(),
  };
}

/**
 * The layer the preview OPENS ON — and it always shows WHAT LEAVES.
 *
 * ⚠️ This is the whole rule, not a per-format preference. This modal has ONE job:
 * verify what is about to leave the machine. Opened on the document as-is — which is
 * what the spreadsheet, the .docx, the presentation and the markdown used to do — gave the
 * INVERSE reading: you re-read your own file, recognize it, send it, and the redaction stayed
 * one more view in the corner menu. The PDF and the image already opened on their painted
 * values; there was no reason for the other formats to do the opposite.
 *
 * The original stays ONE click away, announced for what it is (« Le fichier tel quel, avant
 * masquage ») — re-reading "did it mask what it shouldn't have?" remains possible, but
 * it is no longer what you see first.
 */
export function initialView(s: PreviewShape, file: PreviewFile): DocView {
  // These two ALREADY ARE the redacted version: the fake values are painted on the
  // pages and on the pixels. They stay the opening view for their format.
  if (s.isImage && s.hasBytes) return "image";
  if (s.isPdf && s.hasBytes) return "pdf";
  // Everywhere else: the redacted layer, as soon as there's something to show. Conditioned on
  // `file.text` because `previewViews` only offers « Masqué » under that condition — opening
  // on a view absent from the menu would give a screen nothing points to.
  if (file.text) return "redacted";
  // With no extracted text, there is no redacted layer: show the document.
  if (s.isRich && s.hasBytes) return "rich";
  return "redacted";
}

/** The views on offer, in reading order: the document first, then the text layers.
 *  The LABELS come from the catalog (`docViews`); what remains here is the RULE —
 *  which layer exists for which file shape. */
export function previewViews(s: PreviewShape, file: PreviewFile, t: Messages): DocViewOption[] {
  const v = t.docViews;
  const views: DocViewOption[] = [];
  if (s.isImage && s.hasBytes) views.push({ id: "image", label: v.image });
  if (s.isPdf && s.hasBytes)
    views.push({ id: "pdf", label: v.pdfRedacted, shield: true, hint: v.pdfRedactedHint });
  if (s.isRich && s.hasBytes)
    views.push({
      id: "rich",
      label: s.isSheet ? v.sheet : s.isPptx ? v.presentation : v.document,
      // A sheet's rich view is the file AS IT IS — its « Original », since the redacted
      // layer is a grid too (`AttachmentSheetView`). The others render the document plain.
      ...(s.isSheet ? { hint: v.originalHint } : {}),
    });
  if (s.isMd && !!file.text) views.push({ id: "rendu", label: v.rendered });
  // The ORIGINAL, for the formats whose "document" view IS a redacted one (a PDF's pages
  // are painted) or that have no document view at all (a .txt offered the redacted layer
  // and nothing else). Proof-reading « a-t-il masqué ce qu'il ne fallait pas ? » needed a
  // mark-by-mark hover before this — and the post-send library viewer offers Aperçu, so
  // the original was reachable only once it was too late to change anything.
  if (file.text && !s.isRich)
    views.push({ id: "original", label: v.original, hint: v.originalHint });
  if (file.text)
    // « Ce qui », not « le texte qui » — for a spreadsheet this layer is a GRID.
    views.push({ id: "redacted", label: v.redacted, shield: true, hint: v.redactedHint });
  if (s.hasOcrLayer) views.push({ id: "ocr", label: v.ocr, hint: v.ocrHint });
  return views;
}

/**
 * Can a spreadsheet's « Masqué » view be a GRID, or does it need the text layer?
 *
 * ⚠️ A grid is only redacted if there's something to redact it with. With no replacements
 * (redaction not yet delivered, pass still in flight), the "fake values" render has nothing to
 * substitute: it shows the REAL values under the « Masqué » label. That was
 * tolerable while this view took a click to reach; since it's the one that OPENS,
 * the case became common. With no replacements we therefore fall back to the text layer, which
 * knows how to wait (skeleton) then re-run a pass — never the original on the sly.
 *
 * An EMPTY list, though, is an answer: the pass ran and found nothing, so the
 * file's grid IS its redacted version (same reading as the text layer).
 */
export function redactedGridReady(sheetGrid: boolean, hasReplacements: boolean): boolean {
  return sheetGrid && hasReplacements;
}
