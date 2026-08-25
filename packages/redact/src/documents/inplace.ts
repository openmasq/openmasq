// In-place document redaction — KEEP the file format, scrub the text inside.
// Browser-safe (xlsx + fflate work in both Node and the browser), so the keyless
// webview injector can redact an upload before it leaves while the model still
// receives a real .csv/.xlsx/.docx. Separate entry (@openmasq/redact/inplace)
// so its heavy deps never reach the renderer bundle.
//
// Supported in place: text formats (csv/tsv/txt/json/md/…), XLSX (cell values),
// DOCX (best-effort: replaces values in word/document.xml — misses text split
// across runs), PPTX (same best-effort across every slide/notes part). PDF /
// images / unknown binaries are BLOCKED (can't be redacted faithfully in the
// browser) — callers should refuse the upload.
import * as XLSX from "xlsx";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

/** Scrub plain text → redacted text + the value→placeholder pairs applied (the
 *  pairs let us replace values inside structured XML like DOCX). Injected so the
 *  caller's conversation vault stays the single source of truth. */
export type Scrub = (text: string) => { text: string; pairs: { from: string; to: string }[] };

export interface RedactedFile {
  name: string;
  type: string;
  bytes: Uint8Array;
}

/** Thrown for formats we can't redact in place (PDF, images, unknown binary). */
export class BlockedUploadError extends Error {
  constructor(public readonly ext: string) {
    super(`Cannot redact a .${ext} in place — blocked.`);
    this.name = "BlockedUploadError";
  }
}

const TEXT_EXT = new Set([
  ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".log", ".xml",
  ".yaml", ".yml", ".html", ".htm", ".css", ".js", ".ts", ".tsx", ".jsx",
  ".py", ".java", ".c", ".h", ".cpp", ".rb", ".go", ".rs", ".sh", ".sql",
  ".ini", ".toml", ".env",
]);
const SHEET_EXT = new Set([".xlsx", ".xlsm", ".xls", ".ods"]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}

/**
 * Redact a file's text content while keeping its format. Returns the rewritten
 * bytes. Throws {@link BlockedUploadError} for formats that can't be redacted in
 * place (PDF/images/unknown) so the caller can refuse the upload.
 */
export function redactFileInPlace(
  name: string,
  bytes: Uint8Array,
  type: string,
  scrub: Scrub,
): RedactedFile {
  const ext = extOf(name);
  if (TEXT_EXT.has(ext) || ext === "") {
    const { text } = scrub(strFromU8(bytes));
    return { name, type: type || "text/plain", bytes: strToU8(text) };
  }
  if (SHEET_EXT.has(ext)) return redactSheet(name, bytes, type, scrub);
  if (ext === ".docx") return redactDocx(name, bytes, type, scrub);
  if (ext === ".pptx") return redactPptx(name, bytes, type, scrub);
  throw new BlockedUploadError(ext.slice(1) || "file");
}

/** Scrub a free-text string field, passing anything else through untouched. */
function scrubStr(scrub: Scrub, v: unknown): unknown {
  return typeof v === "string" && v ? scrub(v).text : v;
}

function redactSheet(name: string, bytes: Uint8Array, type: string, scrub: Scrub): RedactedFile {
  const wb = XLSX.read(bytes, { type: "array" });
  // Metadata OUTSIDE the cells (audit): document Props (Author / LastAuthor /
  // Company / Manager…) and defined-name comments round-trip through SheetJS into
  // the saved "redacted" bytes — the DOCX path scrubs docProps for the same
  // reason. A defined name's NAME itself is left as-is (renaming breaks every
  // formula referencing it) — an accepted, documented residual.
  if (wb.Props) {
    for (const k of Object.keys(wb.Props)) {
      (wb.Props as Record<string, unknown>)[k] = scrubStr(scrub, (wb.Props as Record<string, unknown>)[k]);
    }
  }
  for (const n of wb.Workbook?.Names ?? []) {
    if (typeof n.Comment === "string") n.Comment = scrub(n.Comment).text;
  }
  for (const sheet of wb.SheetNames) {
    const ws = wb.Sheets[sheet];
    for (const addr of Object.keys(ws)) {
      if (addr[0] === "!") continue; // skip !ref / !merges metadata
      const cell = ws[addr];
      if (!cell) continue;
      // Cell COMMENTS (threaded/legacy) carry free text + an author name the value
      // loop below never touches — scrub both (a comment can sit on an empty cell).
      if (Array.isArray(cell.c)) {
        for (const cm of cell.c) {
          if (typeof cm.t === "string") cm.t = scrub(cm.t).text;
          if (typeof cm.a === "string") cm.a = scrub(cm.a).text;
        }
      }
      if (cell.v == null) continue;
      if (typeof cell.v === "string" && cell.v) {
        cell.v = scrub(cell.v).text;
        if (typeof cell.w === "string") delete cell.w; // drop cached display text
      } else if (cell.t === "n" || cell.t === "d") {
        // Audit F1/H2 (in-place): the model reads the FORMATTED string (`cell.w`, raw:false),
        // so a phone/account/ID stored as a NUMERIC or DATE cell ships redacted to the model
        // but stays REAL in the saved "redacted" bytes (the string branch never touched it).
        // Scrub its display form; when a value is masked, downgrade the cell to a text
        // placeholder so the underlying number/date can't leak.
        const disp = typeof cell.w === "string" ? cell.w : String(cell.v);
        const scrubbed = scrub(disp).text;
        if (scrubbed !== disp) {
          cell.t = "s";
          cell.v = scrubbed;
          delete cell.w; // cached display
          delete cell.z; // number/date format code (no longer numeric)
        }
      }
    }
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return {
    name,
    type:
      type ||
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes: out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer),
  };
}

// docProps/core.xml (author = `dc:creator`/`cp:lastModifiedBy`) + app.xml (company/manager)
// hold PII in METADATA, and DOCX headers/footers/foot-endnotes/comments hold it OUTSIDE the
// main body — all of which the old "word/document.xml only" scrub LEAKED into the saved
// "redacted" file (audit). These are the text-bearing parts we scrub for each format.
const DOCX_TEXT_PART =
  /^(word\/(document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml|docProps\/(core|app)\.xml)$/;
const PPTX_TEXT_PART =
  /^(ppt\/(slides|notesSlides)\/[^/]+\.xml|docProps\/(core|app)\.xml)$/;

/**
 * Scrub EVERY text-bearing XML part of an OOXML (docx/pptx) zip. Learns value→placeholder
 * pairs from the COMBINED visible text of ALL parts — so a value shared across parts gets ONE
 * stable placeholder, and PII living ONLY in metadata (docProps author) or a header/footer/
 * note is detected + scrubbed too. Then replaces each real value literally in each part's XML.
 * Best-effort (unchanged): a value split across runs (`<w:t>a</w:t><w:t>b</w:t>`) isn't a
 * single literal — the model-facing wire is redacted separately; this scrubs the FILE bytes.
 */
function redactOoxml(
  name: string,
  bytes: Uint8Array,
  type: string,
  defaultType: string,
  isTextPart: (name: string) => boolean,
  scrub: Scrub,
): RedactedFile {
  const zip = unzipSync(bytes);
  const parts = Object.keys(zip).filter(isTextPart);
  if (parts.length) {
    const visible = parts.map((p) => strFromU8(zip[p]).replace(/<[^>]+>/g, " ")).join(" ");
    const pairs = scrub(visible).pairs.filter((p) => p.from);
    if (pairs.length) {
      for (const part of parts) {
        let xml = strFromU8(zip[part]);
        for (const { from, to } of pairs) xml = xml.split(from).join(to);
        zip[part] = strToU8(xml);
      }
    }
  }
  return { name, type: type || defaultType, bytes: zipSync(zip) };
}

function redactDocx(name: string, bytes: Uint8Array, type: string, scrub: Scrub): RedactedFile {
  return redactOoxml(
    name,
    bytes,
    type,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    (k) => DOCX_TEXT_PART.test(k),
    scrub,
  );
}

function redactPptx(name: string, bytes: Uint8Array, type: string, scrub: Scrub): RedactedFile {
  return redactOoxml(
    name,
    bytes,
    type,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    (k) => PPTX_TEXT_PART.test(k),
    scrub,
  );
}
