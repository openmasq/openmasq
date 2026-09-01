import { annotatedCutRow, delimitedGrid } from "@openmasq/redact/documents.browser";
import { MAX_FILE_CHARS } from "../../../../send/foldPayload";

/**
 * The send CUTOFF for a spreadsheet, mapped onto the ROWS of its grid — CSV/TSV
 * only: same parser and same serialization as the extraction
 * (`delimitedGrid`/`annotatedCutRow`, a single house — rule 9), so the row
 * rendered greyed-out is EXACTLY the one where the send stops. A multi-sheet
 * XLSX workbook has no such safe mapping (the extraction skips blank rows):
 * it stays `null` and the caller shows the generic note — never a wrong row.
 * Also null when the annotated text fits within the bound (no cutoff).
 */
export function sheetSendCutRow(
  name: string,
  annotatedLength: number,
  bytes: Uint8Array | null | "error",
  isCsv: boolean,
): number | null {
  if (!isCsv || annotatedLength <= MAX_FILE_CHARS || !(bytes instanceof Uint8Array)) return null;
  const raw = new TextDecoder("utf-8").decode(bytes);
  return annotatedCutRow(delimitedGrid(raw, name.toLowerCase().endsWith(".tsv")), MAX_FILE_CHARS);
}
