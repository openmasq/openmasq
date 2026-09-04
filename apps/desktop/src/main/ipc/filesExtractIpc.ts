import { extractBytes, extractPaths } from "../files";
import { assertReadAllowed } from "./readGate";
import { handle, arr, obj } from "./handle";
import { progressTo } from "./registerFilesIpc";

/**
 * Extractions — by paths (normal, OCR cap at 10 pages, and
 * "Read all", cap lifted — the gesture from the "N/M pages read" chip) and by BYTES
 * (drop and MCP tool files: no path, on purpose). Split out of
 * `registerFilesIpc.ts` (LOC cap) as a thematic block: same family, same guards,
 * same progress relay — side by side so nothing diverges.
 */
export function registerExtractIpc(): void {
  handle("files:extract", [arr], (e, raw) => {
    const paths = raw as string[];
    paths.forEach(assertReadAllowed); // gate before the (Node-only) extractor reads them
    return extractPaths(paths, progressTo(e.sender));
  });
  // "Read all": same extraction + same guard, OCR cap lifted — SEPARATE channel
  // (the IPC surface stays an allow-list of named gestures, not flags).
  handle("files:extract-all", [arr], (e, raw) => {
    const paths = raw as string[];
    paths.forEach(assertReadAllowed);
    return extractPaths(paths, progressTo(e.sender), true);
  });
  // The BYTES route (base64 — drop, and a file produced by an MCP tool). No
  // read guard: the bytes are already at the renderer, nothing new is granted.
  handle("files:extract-bytes", [obj], async (e, raw) => {
    const p = raw as { data: string; name?: string; mime?: string };
    // Uint8Array COPY, never the Buffer (pdf.js rejects it, and Buffer.slice is a view).
    const bytes = new Uint8Array(Buffer.from(p.data, "base64"));
    const name = p.name ?? "file";
    const out = await extractBytes(bytes, name, p.mime, (d, t) => progressTo(e.sender)(name, d, t));
    // A guard REFUSAL (`blocked`: zip bomb, oversized image, unreadable dimensions) is not
    // a parser failure: the renderer must learn it is a refusal so it does NOT keep the
    // bytes for a preview (audit 04/09 — a refused archive was still attached and unzipped
    // in the renderer, because this handler folded the refusal into a generic throw).
    if (out.blocked) return { text: "", error: out.error ?? "refusé", blocked: true };
    // A TOTAL failure rejects ("" would read as "no text"); a partial one returns its text
    // AND the cause, so the chip can say what was left out.
    if (out.error && !out.text.trim()) throw new Error(out.error);
    // STRUCTURED, not the plain text: the preview paints the redacted image from `words` — the
    // drop route used to discard everything but the text, a dropped ID card would open WITHOUT boxes.
    const { text, words, ocrText, ocr, ocrPages, error } = out;
    return {
      text,
      ...(words && { words }),
      ...(ocrText && { ocrText }),
      ...(ocr && { ocr }),
      ...(ocrPages && { ocrPages }),
      ...(error && { error }),
    };
  });
}
