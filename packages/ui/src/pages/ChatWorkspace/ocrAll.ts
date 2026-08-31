import type { ExtractedFile, FilesHost, OcrProgress } from "../../host";
import type { Attachment } from "./Composer";
import { ocrShortfall } from "./ocrShortfall";

export { ocrShortfall };

/**
 * « Lire tout » — re-extract an attachment whose OCR stopped at the cap,
 * this time WITHOUT a cap. Same choreography as the initial extraction
 * (`deferredAttach`): `extracting` + progress during, then the result replaces and
 * redaction resumes — a path that diverged would make the second pass less
 * honest than the first. Extracted from `ChatView` (LOC cap); the dependencies
 * are injected, so testable without the hub.
 */
export interface OcrAllDeps {
  files: Pick<FilesHost, "extractAll">;
  patch(cid: string, patch: Partial<Attachment>): void;
  countMatches(text: string): number;
  /** Journal + re-redaction — the initial extraction's `onExtracted`. */
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
    // Failure LEAVES the old text (10 pages read beats zero) and says so.
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
