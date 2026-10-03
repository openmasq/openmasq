import type { ExtractStreamEvent } from "@openmasq/redact/documents";
import { extractBytes, extractPaths, type ExtractStreamFn } from "../files";
import { cancelExtractJob, registerExtractJob } from "../ocr/extractCancel";
import { assertReadAllowed } from "./readGate";
import { handle, arr, obj, optional, str } from "./handle";
import { progressTo } from "./registerFilesIpc";

/**
 * Extractions — by paths (the WHOLE document: no OCR page cap, so one channel serves a
 * first read and a re-read alike) and by BYTES (drop and MCP tool files: no path, on purpose). Split out of
 * `registerFilesIpc.ts` (LOC cap) as a thematic block: same family, same guards,
 * same progress relay — side by side so nothing diverges.
 */
export function registerExtractIpc(): void {
  // 2nd argument: the caller's stream id (`streamTo`) — absent ⇒ no preview stream.
  // 3rd: the caller's job id (its chip), what `files:extract-cancel` names — absent ⇒ uncancellable.
  handle("files:extract", [arr, optional(str), optional(str)], async (e, raw, req, job) => {
    const paths = raw as string[];
    paths.forEach(assertReadAllowed); // gate before the (Node-only) extractor reads them
    const { signal, done } = registerExtractJob(e.sender.id, job);
    try {
      return await extractPaths(paths, progressTo(e.sender), streamTo(e.sender, req), signal);
    } finally {
      done();
    }
  });
  // The user removed a file still being read: stop ITS extraction (waiting ⇒ leaves the queue,
  // running ⇒ the worker is killed). Scoped to the SENDER: a renderer names only its own jobs
  // (`extractCancel.ts`); an unknown id is a no-op. Stopping work grants nothing.
  handle("files:extract-cancel", [str], (e, job) => cancelExtractJob(e.sender.id, job));
  // The BYTES route (base64 — drop, and a file produced by an MCP tool). No
  // read guard: the bytes are already at the renderer, nothing new is granted.
  handle("files:extract-bytes", [obj], async (e, raw) => {
    const p = raw as { data: string; name?: string; mime?: string; req?: unknown; job?: unknown };
    // Uint8Array COPY, never the Buffer (pdf.js rejects it, and Buffer.slice is a view).
    const bytes = new Uint8Array(Buffer.from(p.data, "base64"));
    const name = p.name ?? "file";
    const progress = progressTo(e.sender);
    const stream = streamTo(e.sender, p.req);
    const { signal, done } = registerExtractJob(e.sender.id, p.job);
    const out = await extractBytes(bytes, name, p.mime, {
      onOcrProgress: (d, t) => progress(name, d, t),
      onWaiting: (ahead) => progress(name, 0, 0, { queued: ahead }),
      onStream: stream ? (ev) => stream(ev, { name }) : undefined,
      signal,
    }).finally(done);
    // A guard REFUSAL (`blocked`: zip bomb, oversized image, unreadable dimensions) is not
    // a parser failure: the renderer must learn it is a refusal so it does NOT keep the
    // bytes for a preview (audit 04/09 — a refused archive was still attached and unzipped
    // in the renderer, because this handler folded the refusal into a generic throw).
    if (out.blocked) return { text: "", error: out.error ?? "refusé", blocked: true };
    // ANY failure rejects, text or not: a document is attached whole or not at all, so a
    // result carrying an error is never handed on as content (`@openmasq/redact` `pdfExtract.ts`).
    if (out.error) throw new Error(out.error);
    // STRUCTURED, not the plain text: the preview paints the redacted image from `words` — the
    // drop route used to discard everything but the text, a dropped ID card would open WITHOUT boxes.
    const { text, words, ocrText, ocr, ocrPages } = out;
    return {
      text,
      ...(words && { words }),
      ...(ocrText && { ocrText }),
      ...(ocr && { ocr }),
      ...(ocrPages && { ocrPages }),
    };
  });
}

/** A stream id the preload minted for ONE invoke: plain, bounded. Anything else ⇒ no stream. */
const STREAM_REQ = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * The PREVIEW stream of an extraction (pages, thumbnails — checked in `ocr/extractStream.ts`)
 * → `files:extract-stream`, sent ONLY to the webContents that asked for this extraction and
 * tagged with ITS id, so the preload hands each event to that one call (two dropped files of
 * the same name never see each other's pages). Display only, best-effort. Absent or malformed
 * id ⇒ `undefined`: the extraction streams nothing.
 */
export function streamTo(sender: Electron.WebContents, req: unknown): ExtractStreamFn | undefined {
  if (typeof req !== "string" || !STREAM_REQ.test(req)) return undefined;
  return (ev: ExtractStreamEvent, file) => {
    try {
      if (!sender.isDestroyed()) sender.send("files:extract-stream", { req, name: file.name, ...(file.path ? { path: file.path } : {}), ...ev });
    } catch {
      /* display only */
    }
  };
}
