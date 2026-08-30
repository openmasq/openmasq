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
 * La couche sur laquelle l'aperçu S'OUVRE — et elle montre toujours CE QUI PART.
 *
 * ⚠️ C'est la règle entière, pas une préférence par format. Cette modale a un seul métier :
 * vérifier ce qui va quitter la machine. Ouverte sur le document tel quel — ce que faisaient
 * le tableur, le .docx, la présentation et le markdown — elle donnait la lecture INVERSE :
 * on relit son propre fichier, on le reconnaît, on envoie, et le redaction restait une vue
 * de plus dans le menu du coin. Le PDF et l'image ouvraient déjà sur leurs valeurs peintes ;
 * il n'y avait aucune raison que les autres formats fassent le contraire.
 *
 * L'original reste à UN clic, annoncé pour ce qu'il est (« Le fichier tel quel, avant
 * redaction ») — relire « a-t-il masqué ce qu'il ne fallait pas ? » reste possible, mais
 * ce n'est plus ce qu'on voit en premier.
 */
export function initialView(s: PreviewShape, file: PreviewFile): DocView {
  // Ces deux-là SONT déjà la version redacted : les fausses valeurs sont peintes sur les
  // pages et sur les pixels. Elles restent la vue d'ouverture de leur format.
  if (s.isImage && s.hasBytes) return "image";
  if (s.isPdf && s.hasBytes) return "pdf";
  // Partout ailleurs : la couche redacted, dès qu'il y a de quoi la montrer. Conditionné à
  // `file.text` parce que `previewViews` n'offre « Redacted » qu'à cette condition — ouvrir
  // sur une vue absente du menu donnerait un écran que rien ne désigne.
  if (file.text) return "redacted";
  // Sans texte extrait, il n'y a pas de couche redacted : on montre le document.
  if (s.isRich && s.hasBytes) return "rich";
  return "redacted";
}

/** The views on offer, in reading order: the document first, then the text layers.
 *  Les ÉTIQUETTES viennent du catalogue (`docViews`) ; ce qui reste ici est la RÈGLE —
 *  quelle couche existe pour quelle forme de fichier. */
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
 * La vue « Redacted » d'un tableur peut-elle être une GRILLE, ou faut-il la couche texte ?
 *
 * ⚠️ Une grille n'est redacted que si l'on a de quoi la redact. Sans remplacements
 * (redaction non transmis, passe encore en vol), le rendu « fausses valeurs » n'a rien à
 * substituer : il affiche les VRAIES valeurs sous l'étiquette « Redacted ». C'était
 * supportable tant que cette vue demandait un clic ; depuis qu'elle est celle qui S'OUVRE,
 * le cas est devenu courant. Sans remplacements on retombe donc sur la couche texte, qui
 * sait attendre (squelette) puis relancer une passe — jamais l'original en douce.
 *
 * Une liste VIDE, elle, est une réponse : la passe a tourné et n'a rien trouvé, donc la
 * grille du fichier EST sa version redacted (même lecture que la couche texte).
 */
export function redactedGridReady(sheetGrid: boolean, hasReplacements: boolean): boolean {
  return sheetGrid && hasReplacements;
}
