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
  // L'extraction se fait LÀ OÙ EST LE FICHIER quand la plateforme le sait faire, et EN MÊME
  // TEMPS que la lecture des octets : les deux sont indépendants, les enchaîner ajoutait
  // l'OCR bout à bout à la lecture. Le repli, lui, DOIT rester séquentiel — il renvoie les
  // octets d'où ils viennent pour les faire extraire, et il ne rend que du TEXTE :
  // `words`/`ocrPages` restent de l'autre côté, donc un scan s'affiche sans ses boîtes.
  // C'est cette perte, pas le redaction, qui laissait un document local sans marques.
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
    // La FORME du fichier, pas « document » en dur : la tuile image, la vue feuille et le
    // contournement d'erreur des images se décident tous là-dessus, et un `kind` figé les
    // faisait tous manquer leur cible.
    kind: typeof rich?.kind === "string" ? rich.kind : "document",
    text,
    chars: text.length,
    mime,
    data: base64,
    // ⚠️ Jamais de `path` : la plateforme n'en rend pas, et en fabriquer un ici rouvrirait
    // exactement la porte que `localfs:extract` referme.
    path: undefined,
  };
}
