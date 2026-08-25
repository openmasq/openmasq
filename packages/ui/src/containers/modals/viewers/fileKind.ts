import { redactionCategory } from "@openmasq/redact";
import { REDACT_CATEGORIES } from "../../../privacy/redactCategories";

/** Format sniffing + small pure labels for the file viewer (FileViewerModal). */

const TEXT_MIME = /^(text\/|application\/(json|xml|javascript|x-yaml|x-sh))/i;
const TEXT_EXT =
  /\.(txt|json|log|xml|ya?ml|html?|css|js|ts|tsx|jsx|py|java|c|h|cpp|rb|go|rs|sh|sql|ini|toml|env)$/i;
const MD_MIME = /^text\/(x-)?markdown/i;
const MD_EXT = /\.(md|markdown|mdown|mkd|mdx)$/i;
const IMG = /^image\/|\.(png|jpe?g|webp|bmp|tiff?|gif)$/i;
const SHEET_MIME = /spreadsheetml|ms-excel|opendocument\.spreadsheet|^text\/csv/i;
const SHEET_EXT = /\.(xlsx|xlsm|xls|ods|csv|tsv)$/i;
const DOCX = /wordprocessingml\.document|\.docx$/i;
export const CSV = /^text\/csv/i;
export const CSV_EXT = /\.(csv|tsv)$/i;
const PPTX = /presentationml\.presentation|\.pptx$/i;

export type FileViewerKind = "image" | "markdown" | "text" | "pdf" | "sheet" | "docx" | "pptx" | "other";

export function kindOf(mime: string, name: string): FileViewerKind {
  if (IMG.test(mime) || IMG.test(name)) return "image";
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (DOCX.test(mime) || DOCX.test(name)) return "docx";
  if (PPTX.test(mime) || PPTX.test(name)) return "pptx";
  if (SHEET_MIME.test(mime) || SHEET_EXT.test(name)) return "sheet";
  if (MD_MIME.test(mime) || MD_EXT.test(name)) return "markdown";
  if (TEXT_MIME.test(mime) || TEXT_EXT.test(name)) return "text";
  return "other";
}

export const fmtSize = (n: number): string =>
  n < 1024 ? `${n} o` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} Ko` : `${(n / 1048576).toFixed(1)} Mo`;

const CAT_LABEL = new Map(REDACT_CATEGORIES.map((c) => [c.key, c.label]));
/** Distinct FR category labels present in a conversation's `kinds` map — for the
 *  redacted summary banner. Real data (never fabricated); capped for length. */
export function maskedLabels(kinds?: Record<string, string>): string {
  if (!kinds) return "";
  const keys = new Set<string>();
  for (const v of Object.values(kinds)) keys.add(redactionCategory(v));
  return [...keys].map((k) => CAT_LABEL.get(k as never) ?? k).slice(0, 6).join(", ");
}

/** Which loading-skeleton silhouette fits a file: a framed rectangle for images, a few
 *  rows for spreadsheets, a page of lines for everything else (docs / PDF / text). */
export function fileSkelVariant(mime: string, name: string): "doc" | "image" | "sheet" {
  const k = kindOf(mime, name);
  return k === "image" ? "image" : k === "sheet" ? "sheet" : "doc";
}

export const tileLabel = (kind: FileViewerKind, name: string): string => {
  if (kind === "image") return "IMG";
  const m = /\.([a-z0-9]{1,5})$/i.exec(name);
  return (m ? m[1] : "FIC").toUpperCase().slice(0, 4);
};
