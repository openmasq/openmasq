import type { ExtractedBytes, ExtractedFile, OcrProgress } from "../../host";
import type { DeferredFile } from "../../state/deferredFile";

/**
 * Turning DROPPED files into the shape the composer already knows.
 *
 * ⚠️ The route is bytes, never a path, and that is a security decision rather than a
 * convenience (`dropIntake.ts` states it in full): `files:read` is default-refuse and only
 * opens for a path a NATIVE picker granted, so handing a dropped path to main would be an
 * arbitrary-disk-read primitive for a renderer XSS. The browser already gave us the bytes,
 * which the renderer legitimately holds — so `files:extract-bytes` needs no new grant.
 *
 * Failure is PER FILE. Dropping five documents where one is corrupt must attach the four
 * that worked and mark the fifth, never throw the batch away — the same contract the
 * path-based extraction already honours.
 */

export interface ExtractDroppedDeps {
  /** `host.files.extractBytes` — base64 in, STRUCTURED extraction out (text + words/
   *  ocrText/ocr): that's what makes a dropped image paintable as REDACTED. */
  extractBytes(
    data: string,
    name: string,
    mime?: string,
    onOcrProgress?: (p: OcrProgress) => void,
  ): Promise<ExtractedBytes>;
  toBase64(bytes: Uint8Array): string;
}

/** Refuse a file too large to carry through the IPC as base64 before reading it into
 *  memory. The cap is generous for a document and stops a dropped disk image from
 *  hanging the renderer on `arrayBuffer()`. */
export const MAX_DROP_BYTES = 64 * 1024 * 1024;

/**
 * Un fichier déposé sous la forme DIFFÉRÉE du shell (`DeferredFile`) : le chip paraît
 * AVANT la lecture (même promesse que « Demander » et la Bibliothèque — une seule
 * mécanique de mise en scène, `deferredAttach.ts`), et la progression OCR remonte page
 * par page. Le canal de progression est partagé entre extractions concurrentes, d'où le
 * filtre sur le NOM du fichier.
 */
export function deferDroppedFile(file: File, deps: ExtractDroppedDeps): DeferredFile {
  return {
    name: file.name,
    ...(file.type ? { mime: file.type } : {}),
    load: (onOcrProgress) =>
      extractOne(file, deps, (p) => {
        if (p.name === file.name) onOcrProgress?.({ done: p.page, total: p.pages });
      }),
  };
}

export async function extractDroppedFiles(
  files: readonly File[],
  deps: ExtractDroppedDeps,
): Promise<ExtractedFile[]> {
  return Promise.all(files.map((file) => extractOne(file, deps)));
}

async function extractOne(
  file: File,
  deps: ExtractDroppedDeps,
  onOcrProgress?: (p: OcrProgress) => void,
): Promise<ExtractedFile> {
  const base: ExtractedFile = { name: file.name, kind: file.type || "", text: "", chars: 0 };
  if (file.size > MAX_DROP_BYTES) {
    return { ...base, error: "fichier trop volumineux" };
  }
  let data: string;
  try {
    data = deps.toBase64(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "lecture impossible" };
  }
  // ⚠️ `data` rides ALONG with the text, and that is not incidental: `redactAndSave` uses
  // the in-memory bytes INSTEAD of `path` when present (`host/files.ts`), which is the
  // library's re-attach route. Without it a dropped file has neither — so it could not be
  // stored, previewed, or sent to a vision model as redacted images. A drop has no usable
  // path by design (see `dropIntake.ts`), so the bytes are the ONLY way it gets those.
  const carried: ExtractedFile = { ...base, data, ...(file.type ? { mime: file.type } : {}) };
  try {
    const r = await deps.extractBytes(data, file.name, file.type || undefined, onOcrProgress);
    // TOUT ce que la route bytes rend voyage avec le fichier : `words` est ce qui
    // permet à l'aperçu de peindre l'image REDACTED (boîtes) au lieu de l'originale.
    return {
      ...carried,
      text: r.text,
      chars: r.text.length,
      ...(r.words ? { words: r.words } : {}),
      ...(r.ocrText ? { ocrText: r.ocrText } : {}),
      ...(r.ocr ? { ocr: r.ocr } : {}),
      ...(r.ocrPages ? { ocrPages: r.ocrPages } : {}),
    };
  } catch (e) {
    // Extraction failed, but the BYTES are still good — keep them so the file can be
    // stored and previewed even when no text could be pulled out of it.
    return { ...carried, error: e instanceof Error ? e.message : "extraction échouée" };
  }
}
