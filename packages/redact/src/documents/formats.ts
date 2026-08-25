// Format tables + name helpers + the trivial isomorphic serializers (sheets, pptx).
// Split out of core.ts so the dispatch core stays about FLOW (layers, OCR routing,
// reconciliation), not about which extension means what.

/** Plain-text formats: decoded verbatim as UTF-8. */
export const TEXT_EXT = new Set([
  ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".log", ".xml",
  ".yaml", ".yml", ".html", ".htm", ".css", ".js", ".ts", ".tsx", ".jsx",
  ".py", ".java", ".c", ".h", ".cpp", ".rb", ".go", ".rs", ".sh", ".sql",
  ".ini", ".toml", ".env",
]);
/** Spreadsheets: every sheet flattened to CSV so cell values run the same path. */
export const SHEET_EXT = new Set([".xlsx", ".xlsm", ".xls", ".ods"]);
/** Image formats: OCR'd to text. HEIC excluded (Tesseract can't decode it). */
export const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif", ".gif"]);

/** All extensions whose text we can extract (no leading dot). */
export const SUPPORTED_EXTENSIONS: string[] = [
  "pdf",
  "docx",
  "pptx",
  ...[...SHEET_EXT].map((e) => e.slice(1)),
  ...[...IMAGE_EXT].map((e) => e.slice(1)),
  ...[...TEXT_EXT].map((e) => e.slice(1)),
];

/** MIME type → file extension, to pick a format when a name has no extension. */
export const MIME_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/csv": ".csv",
  "text/tab-separated-values": ".tsv",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "text/html": ".html",
  "application/json": ".json",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
  "image/tiff": ".tiff",
};

/** basename without node:path (pure). */
export function baseName(p: string): string {
  return p.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || p;
}
/** lowercased extension (incl. dot), or "" — dotfiles (".env") count as no ext. */
export function extOf(name: string): string {
  const b = baseName(name);
  const i = b.lastIndexOf(".");
  return i > 0 ? b.slice(i).toLowerCase() : "";
}

/**
 * Serialize a parsed SheetJS workbook to HEADER-ANNOTATED text (approach A): each
 * sheet's grid → `header: value | header: value` rows, so the detector reads a
 * cell next to its column label instead of a flat dump whose header is rows away.
 * `raw:false` gives the FORMATTED string a human sees (kept verbatim → reversible).
 */
export async function sheetText(bytes: Uint8Array): Promise<string> {
  const { gridToAnnotatedText } = await import("./tabular");
  // SheetJS is isomorphic → shared here (dynamic import keeps it out of ../index).
  const XLSX: any = await import("xlsx");
  const wb = XLSX.read(bytes, { type: "array" });
  const names: string[] = wb.SheetNames ?? [];
  return names
    .map((sheetName) => {
      const rows: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
      });
      return gridToAnnotatedText(rows, names.length > 1 ? sheetName : undefined);
    })
    .filter((block) => block.trim().length > 0)
    .join("\n\n");
}

/** PPTX text: unzip (fflate is isomorphic), read each slide's XML in order and
 *  concatenate the `<a:t>` run text. Pure — no Node/DOM. */
export async function pptxText(bytes: Uint8Array): Promise<string> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const zip = unzipSync(bytes);
  const slides = Object.keys(zip)
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort((a, b) => (a.match(/\d+/)?.[0] as any) - (b.match(/\d+/)?.[0] as any));
  return slides
    .map((k) => {
      const xml = strFromU8(zip[k]);
      const runs = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]);
      return runs.join(" ").replace(/\s+/g, " ").trim();
    })
    .filter(Boolean)
    .join("\n\n");
}
