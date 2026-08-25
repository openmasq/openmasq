import type { ExtractedFile, FilesHost, OcrProgress } from "../../host";
import type { Attachment } from "./Composer";
import { ocrShortfall } from "./ocrShortfall";

export { ocrShortfall };

/**
 * « Lire tout » — ré-extraire une pièce jointe dont l'OCR s'est arrêté au plafond,
 * cette fois SANS plafond. Même chorégraphie que l'extraction initiale
 * (`deferredAttach`) : `extracting` + progression pendant, puis le résultat remplace et
 * le redaction reprend — un chemin qui divergerait rendrait le second passage moins
 * honnête que le premier. Extrait de `ChatView` (cap LOC) ; les dépendances sont
 * injectées, donc testable sans le hub.
 */
export interface OcrAllDeps {
  files: Pick<FilesHost, "extractAll">;
  patch(cid: string, patch: Partial<Attachment>): void;
  countMatches(text: string): number;
  /** Journal + re-redaction — le `onExtracted` de l'extraction initiale. */
  onExtracted(file: ExtractedFile, attachment: Attachment): void;
}

export async function ocrAllAttachment(deps: OcrAllDeps, a: Attachment): Promise<void> {
  if (!a.path || !deps.files.extractAll) return;
  deps.patch(a.cid, { extracting: true, error: undefined, extractProgress: undefined });
  let file: ExtractedFile;
  try {
    const out = await deps.files.extractAll([a.path], (pr: OcrProgress) =>
      deps.patch(a.cid, { extractProgress: { done: pr.page, total: pr.pages } }),
    );
    if (!out[0]) throw new Error("extraction vide");
    file = out[0];
  } catch {
    // L'échec LAISSE l'ancien texte (10 pages lues valent mieux que zéro) et le dit.
    deps.patch(a.cid, { extracting: false, extractProgress: undefined, error: "relecture échouée" });
    return;
  }
  const redactPreview = deps.countMatches(file.text);
  deps.patch(a.cid, {
    ...file,
    extracting: false,
    extractProgress: undefined,
    redactPreview,
    redacting: !!file.text.trim(),
  });
  deps.onExtracted(file, { ...a, ...file, redactPreview });
}
