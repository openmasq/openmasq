import type { ExtractedFile, Host, LocalFsEntry } from "../../../host";

/** Extension → mime, for the handful of formats the aperçu and the send actually branch
 *  on. A local listing carries no content-type, and guessing wrong only costs a less
 *  specific viewer — never a security decision. */
const EXT_MIME: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  xml: "application/xml",
  yml: "text/x-yaml",
  yaml: "text/x-yaml",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "application/javascript",
  ts: "text/plain",
  tsx: "text/plain",
  jsx: "text/plain",
  py: "text/plain",
  sh: "text/plain",
  sql: "text/plain",
  log: "text/plain",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
};

export function mimeOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return (m && EXT_MIME[m[1].toLowerCase()]) || "application/octet-stream";
}

/**
 * Build a composer attachment from a browsed local file.
 *
 * The bytes ride as `data` (base64), never as a `path`. That is not a detail: `files:read`
 * / `files:extract` sit behind main's read gate, which grants a path only when the user
 * picked it in the NATIVE dialog — a folder grant is a different capability, and routing
 * a browsed path through that gate would mean widening it. Handing over bytes the renderer
 * already holds grants nothing new, and it reuses the library re-attach path verbatim.
 *
 * The send pipeline then redacted this file with the conversation's OWN vault, exactly
 * like a dropped one: browsing shows the user their real file, sending still masks it.
 */
export async function loadLocalFile(host: Host, entry: LocalFsEntry): Promise<ExtractedFile> {
  const fs = host.localFs;
  if (!fs) throw new Error("Navigation de dossiers indisponible.");
  const mime = mimeOf(entry.name);
  // Extraction happens WHERE THE FILE IS when the platform can do it, and AT THE SAME
  // TIME as reading the bytes: the two are independent, chaining them added
  // OCR end-to-end to the read. The fallback, though, MUST stay sequential — it sends the
  // bytes back to where they came from to have them extracted, and it only returns TEXT:
  // `words`/`ocrPages` stay on the other side, so a scan shows up without its boxes.
  // It was this loss, not redaction, that left a local document with no marks.
  const [{ base64 }, rich] = await Promise.all([
    fs.read(entry.path),
    fs.extract?.(entry.path).catch(() => undefined),
  ]);
  let text = typeof rich?.text === "string" ? rich.text : "";
  if (!rich)
    try {
      text = (await host.files?.extractBytes?.(base64, entry.name, mime))?.text ?? "";
    } catch {
      /* unextractable (image without OCR here, unknown binary) → still attachable */
    }
  return {
    ...(rich ?? {}),
    name: entry.name,
    // The file's SHAPE, not a hardcoded « document »: the image tile, the sheet view and the
    // image error fallback all decide on this, and a frozen `kind` used to make
    // them all miss their target.
    kind: typeof rich?.kind === "string" ? rich.kind : "document",
    text,
    chars: text.length,
    mime,
    data: base64,
    // ⚠️ Never a `path`: the platform doesn't return one, and fabricating one here would reopen
    // exactly the door that `localfs:extract` closes.
    path: undefined,
  };
}
