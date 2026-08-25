import { isPlatformProvider, type LlmAttachment } from "@openmasq/llm";
import { findModelAny } from "../../prompt/models";
import type { Host } from "../../host";
import type { Attachment } from "./Composer";
import { pdfToRedactedImages, canSendAsImages } from "./renderDocImages";

/** One progress step for the document-prep indicator (setter shape from ChatView). */
export type DocPrepStep = {
  name: string;
  phase: "detect" | "render";
  page: number;
  total: number;
  idx: number;
  count: number;
};

/**
 * Render each sendable document's REDACTED pages to images for a "send as file" turn:
 * read the (granted) file bytes, paint the drop-time redaction onto the pages (already
 * fakes — safe), and collect them + a fake→real `fileVault` so the reply un-redacts. A
 * PLATFORM (metered gateway) target downscales harder to fit the body cap. Revealed values
 * are painted in CLEAR and get no vault entry. Returns null the instant `ctrl` aborts.
 * Extracted from ChatView; the only component captures are `host` + the progress setter.
 */
export async function buildFileImages(
  mode: { text: string; usable: Attachment[] },
  targetModelId: string | undefined,
  ctrl: AbortController,
  quiet: boolean,
  host: Host,
  setDocPrep: (p: DocPrepStep) => void,
): Promise<{
  images: LlmAttachment[];
  imageNames: string[];
  fileVault: Record<string, string>;
  totalB64: number;
  platform: boolean;
} | null> {
  const renderable = mode.usable.filter(
    (a) => canSendAsImages(a.name, a.mime) && a.path && host.files?.read,
  );
  const targetModel = targetModelId ? findModelAny(targetModelId) : undefined;
  const platform = targetModel ? isPlatformProvider(targetModel.provider) : false;
  const imgOpts = platform ? { maxEdge: 1600, quality: 0.8 } : { maxEdge: 2200, quality: 0.9 };
  const images: LlmAttachment[] = [];
  const imageNames: string[] = [];
  const fileVault: Record<string, string> = {};
  let idx = 0;
  for (const a of renderable) {
    idx++;
    const reps = a.replacements ?? [];
    const reveal = new Set(a.reveal ?? []);
    if (!quiet) setDocPrep({ name: a.name, phase: "render", page: 0, total: 0, idx, count: renderable.length });
    try {
      const bytes = await host.files!.read!(a.path!);
      if (ctrl.signal.aborted) return null;
      const imgs = await pdfToRedactedImages(bytes, reps, {
        // Scanned pages paint from the drop-time OCR geometry (and only ship when
        // the per-value coverage gate accepts the paint — unchanged, fail-closed).
        ocrPages: a.ocrPages,
        reveal,
        ...imgOpts,
        signal: ctrl.signal,
        onProgress: (p) => {
          if (!quiet && !ctrl.signal.aborted)
            setDocPrep({ name: a.name, ...p, idx, count: renderable.length });
        },
      });
      if (ctrl.signal.aborted) return null;
      if (imgs.length) {
        images.push(...imgs);
        imageNames.push(a.name);
        for (const r of reps) if (!reveal.has(r.real)) fileVault[r.fake] = r.real;
      }
    } catch {
      /* couldn't render → this file falls back to its extracted text */
    }
  }
  if (ctrl.signal.aborted) return null;
  const totalB64 = images.reduce((s, i) => s + i.dataBase64.length, 0);
  return { images, imageNames, fileVault, totalB64, platform };
}
