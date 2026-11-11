import { open } from "node:fs/promises";
import { basename } from "node:path";
import { MAX_FILE_BYTES } from "@openmasq/redact";
import type { ExtractedFile, ExtractStreamEvent } from "@openmasq/redact/documents";
import { mainLocale, mainMessages } from "../i18n";
import { inWorkerOnly, runInWorker, runJob } from "./extractClient";
import type { InplaceRequest, InplaceResult } from "./inplaceScrub";
import { createExtractQueue } from "./extractQueue";
import { localizeExtracted } from "./localizeExtracted";

/**
 * The extraction ENTRY POINTS: one queue (`extractQueue.ts`) in front of the worker client
 * (`extractClient.ts`), the ONLY place a document is parsed: main never reads one, even when
 * the worker cannot start (the document is then refused, `inWorkerOnly`). A failure comes back
 * worded in the user's language (`localizeExtracted.ts`).
 *
 * `signal` = the user removed the file (`extractCancel.ts`): a waiting job leaves the line, a
 * running worker job is killed.
 */

/** Optional per-call hooks, the same for both routes. */
export interface ExtractCallbacks {
  onOcrProgress?: (done: number, pages: number) => void;
  /** While queued: how many files are ahead (re-told as the line moves). */
  onWaiting?: (ahead: number) => void;
  /** The preview stream (pages, thumbnails). */
  onStream?: (ev: ExtractStreamEvent) => void;
  signal?: AbortSignal;
}

/** ONE document at a time (why: `extractQueue.ts`). The worker timeout is armed inside
 *  `runInWorker`, so it counts from the job's START. */
const queue = createExtractQueue(1);

async function inWorker(viaWorker: () => Promise<ExtractedFile>): Promise<ExtractedFile> {
  const t = mainMessages().documents;
  return localizeExtracted(await inWorkerOnly(viaWorker, t.readerUnavailable, { memory: t.readerOverMemory, disk: t.readerOverDisk }), t);
}

/**
 * A file's bytes, read HERE: the worker is never handed a path, so a worker shut in by the system
 * reads none of the user's files (`extractSandbox.ts`). The size gate runs on the open handle's
 * stat before a byte is read, as the engine's own path entry does; past it, the engine's refusal.
 */
async function fileBytes(filePath: string): Promise<Uint8Array | ExtractedFile> {
  const fh = await open(filePath, "r");
  try {
    if ((await fh.stat()).size > MAX_FILE_BYTES) {
      const mb = Math.round(MAX_FILE_BYTES / 1024 / 1024);
      return { name: basename(filePath), kind: "file", text: "", chars: 0, error: `File too large (${mb} MB max)`, errorCode: "file_too_large", errorParams: { mb }, blocked: true };
    }
    return new Uint8Array(await fh.readFile());
  } finally {
    await fh.close();
  }
}

/** Extraction of a file on disk, in the worker: its bytes, never its path. */
export function extractTextInWorker(filePath: string, cb: ExtractCallbacks = {}): Promise<ExtractedFile> {
  // The markers OCR writes into the text speak the user's language: the worker gets the
  // locale and rebuilds them from the catalogue.
  const locale = mainLocale();
  return queue.run(
    async (signal) => {
      const bytes = await fileBytes(filePath);
      if (!(bytes instanceof Uint8Array)) return localizeExtracted(bytes, mainMessages().documents);
      const data = Buffer.from(bytes).toString("base64");
      return inWorker(() => runInWorker({ kind: "bytes", data, name: basename(filePath), locale }, cb.onOcrProgress, cb.onStream, signal));
    },
    cb.onWaiting,
    cb.signal,
  );
}

/** Extraction of in-memory bytes (base64 on the IPC caller side) — same contract. */
export function extractBytesInWorker(
  bytes: Uint8Array,
  name: string,
  mime: string | undefined,
  cb: ExtractCallbacks = {},
): Promise<ExtractedFile> {
  const locale = mainLocale();
  return queue.run(
    (signal) => {
      const data = Buffer.from(bytes).toString("base64");
      return inWorker(() => runInWorker({ kind: "bytes", data, name, mime, locale }, cb.onOcrProgress, cb.onStream, signal));
    },
    cb.onWaiting,
    cb.signal,
  );
}

/**
 * The format-preserving scrub of `files:redact-and-save` (`inplaceScrub.ts`) — on the worker,
 * NOT in the queue: it is a parse and a rewrite, never minutes of OCR, and a saved copy must
 * not wait behind the files still being read. Never in main: a failed job (timeout, crash,
 * a worker that cannot start) stores the original alone: `scrubbed: null`, fail closed.
 */
export async function scrubInPlaceInWorker(req: InplaceRequest): Promise<InplaceResult> {
  const viaWorker = async (): Promise<InplaceResult> => {
    const { bytes, ...rest } = req;
    const r = await runJob<Omit<InplaceResult, "scrubbed"> & { scrubbed: string | null }>({
      kind: "inplace",
      ...rest,
      data: Buffer.from(bytes).toString("base64"),
    });
    return { ...r, scrubbed: r.scrubbed == null ? null : new Uint8Array(Buffer.from(r.scrubbed, "base64")) };
  };
  try {
    return await viaWorker();
  } catch {
    return { scrubbed: null, vault: { ...req.vault }, kinds: {}, spans: [] };
  }
}
