import { existsSync } from "node:fs";
import { join } from "node:path";
import { app, utilityProcess } from "electron";
import type { ExtractedFile, ExtractStreamEvent } from "@openmasq/redact/documents";
import { reportMainError } from "../runtime/errorReport";
import { isAppQuitting } from "../runtime/quitState";
import { BRAND } from "@openmasq/branding";
import { extractTimeoutMs } from "@openmasq/redact";
import { checkStreamMessage } from "./extractStream";
import { SandboxUnbornError, sandboxedWorker, type WorkerChild } from "./extractSandbox";

/**
 * CLIENT of the extraction worker (`extractWorker.ts`) — the documents counterpart of
 * `../localNer.ts`, for the same reason: extracting a scan cost bursts of
 * ~1 s of synchronous CPU IN main (IPC ping measured at 1,100 ms during OCR, 13/08), and
 * main is the process holding IPC, menus and windows. Lazy fork,
 * `{id, progress|result}` relay, idle eviction (tesseract WASM + docTR onnxruntime
 * sessions = a RAM floor we give back), an unexpected death reported NAMED.
 *
 * ⛔ NO IN-PROCESS FALLBACK. Main never parses a document: a crafted file meets the parsers
 * (pdf.js, the office readers, the image decoders) only in the worker. A worker that cannot
 * be BORN (the bundle is missing, the fork throws, or the child dies/stalls before its
 * `ready`) fails CLOSED: the document is refused with a sentence saying the reader is
 * unavailable (`inWorkerOnly`). A job that fails AFTER `ready` (timeout, crash, OOM) failed
 * because of its FILE: that file is in error, and the next one gets a fresh worker — as after a WORKBOOK (`recycle`).
 */

/** The worker could not be born (see the header): the document is refused, never read in main. */
export class WorkerUnbornError extends Error {
  constructor(cause: string) {
    super(`worker d'extraction indisponible (${cause})`);
    this.name = "WorkerUnbornError";
  }
}

type Reply =
  | { ready: true }
  | { id: number; progress: { done: number; pages: number } }
  | { id: number; page: unknown }
  | { id: number; thumb: unknown }
  | { id: number; ok: true; file: unknown; recycle?: true }
  | { id: number; ok: false; error: string; recycle?: true };

interface Pending {
  resolve: (f: never) => void;
  reject: (e: Error) => void;
  onProgress?: (done: number, pages: number) => void;
  /** The preview stream, already checked (`extractStream.ts`). */
  onStream?: (ev: ExtractStreamEvent) => void;
  timer: ReturnType<typeof setTimeout>;
  /** The page count the deadline was last scaled to (0 = the floor). */
  scaledFor: number;
  /** Re-arm the deadline for `pages` pages, counted from the job's START. */
  rescale: (pages: number) => void;
}

// Backstop only (a worker stuck without dying): `extractTimeoutMs` (`@openmasq/redact`, the
// single home of the document limits) — a floor until the count of pages OCR reads is known,
// then rescaled to it on the first progress tick. A whole document is read, so the deadline
// follows its length; past it the file is in ERROR, never returned in part.
// Tesseract WASM + docTR sessions are heavy: we give back the RAM after this idle period.
const IDLE_MS = 5 * 60 * 1000;
const STDERR_RING_MAX = 2000;
let stderrRing = "";

let child: WorkerChild | null = null;
/** how the running worker is shut in: by the system (`extractSandbox.ts`), or a process apart only */
let isolation: "system" | "process" | null = null;
/** the system's jail did not start once: the utilityProcess for the session, and why */
let sandboxFailed: string | null = null;
const sandboxedChildren = new WeakSet<WorkerChild>();
let seq = 0;
let inflight = 0;
let idleTimer: NodeJS.Timeout | null = null;
/** The worker could not be born: reported ONCE per session. */
let unbornReported = false;
/** Children that sent `ready`: their modules loaded, so any later death is a job's. */
const readyChildren = new WeakSet<WorkerChild>();
const pending = new Map<number, Pending>();

function rejectAll(err: Error): void {
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(err);
  }
  pending.clear();
}

function killChild(): void {
  const c = child;
  child = null; // detached BEFORE kill: the exit becomes "expected" for the reporter
  rejectAll(new Error("worker d'extraction arrêté"));
  if (c) {
    try {
      c.kill();
    } catch {
      /* best-effort */
    }
  }
}

/** How the worker runs, and why the system's jail did not start (the packaged smoke test says both). */
export const extractIsolation = () => ({ isolation, sandboxFailed });

function ensureChild(): WorkerChild {
  if (child) return child;
  // shut in by the system when this machine can; else the utilityProcess, as before
  const shut = sandboxFailed ? null : sandboxedWorker();
  const worker = join(__dirname, "extractWorker.js"); // emitted by electron-vite (main entry)
  if (!shut && !existsSync(worker)) throw new WorkerUnbornError("bundle absent");
  let c: WorkerChild;
  try {
    c = shut ?? forkWorker(worker);
  } catch (e) {
    throw new WorkerUnbornError(e instanceof Error ? e.message : String(e));
  }
  if (shut) sandboxedChildren.add(c);
  isolation = shut ? "system" : "process";
  if (app.isPackaged || shut) {
    c.stderr?.on("data", (d: Buffer) => {
      stderrRing = (stderrRing + String(d)).slice(-STDERR_RING_MAX);
    });
  }
  c.on("message", (msg: Reply) => {
    if ("ready" in msg) {
      readyChildren.add(c);
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    if ("progress" in msg) {
      if (msg.progress.pages > p.scaledFor) p.rescale(msg.progress.pages);
      p.onProgress?.(msg.progress.done, msg.progress.pages);
      return;
    }
    if ("page" in msg || "thumb" in msg) {
      const ev = checkStreamMessage(msg);
      if (ev) p.onStream?.(ev);
      return;
    }
    clearTimeout(p.timer); pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.file as never);
    else p.reject(new Error(msg.error));
    if (msg.recycle && child === c) killChild(); // SheetJS read that file (`extractWorker.ts`)
  });
  c.on("exit", (code) => {
    if (child !== c) return; // detached by `killChild`, which already answered its jobs
    if (!isAppQuitting()) {
      reportMainError(
        "ocr",
        `worker-exit-${code ?? "?"}`,
        new Error(`extract-worker mort (code ${code})${stderrRing ? ` — stderr: ${stderrRing.slice(-400)}` : ""}`),
      );
    }
    child = null;
    if (!readyChildren.has(c) && sandboxedChildren.has(c)) sandboxFailed = `code ${code}: ${stderrRing.slice(-300)}`;
    rejectAll(
      readyChildren.has(c)
        ? new Error("le worker d'extraction s'est arrêté")
        : sandboxedChildren.has(c)
          ? new SandboxUnbornError(`arrêté avant d'être prêt (code ${code})`)
          : new WorkerUnbornError(`arrêté avant d'être prêt (code ${code})`),
    );
  });
  child = c;
  return c;
}

function forkWorker(worker: string): WorkerChild {
  const proc = utilityProcess.fork(worker, [], {
    serviceName: `${BRAND.slug}-extract`,
    // MINIMAL env: only the OCR asset paths/pins that `runtime/ocrAssets.ts` set
    // on process.env at whenReady — NEVER the whole env (secrets). Absent (dev without
    // a bake) ⇒ the worker follows the same fallbacks as main (dev CDN / Tesseract-only).
    env: {
      ...Object.fromEntries(
        ["OPENMASQ_TESSERACT_LANG_PATH", "OPENMASQ_DOCTR_MODEL_PATH", "OPENMASQ_DOCTR_INTEGRITY", "OPENMASQ_DOCTR_REQUIRE_PIN"]
          .filter((k) => process.env[k])
          .map((k) => [k, process.env[k] as string]),
      ),
      // packaged: its OCR assets are baked, so it never needs the network (`../security/offline.ts`)
      ...(app.isPackaged ? { OPENMASQ_OFFLINE: "1" } : {}),
    },
    // Same contract as the NER worker: the worker NEVER writes the extracted text to
    // stdout/stderr — the bounded ring is only read back in the report of an abnormal death.
    stdio: app.isPackaged ? "pipe" : "inherit",
  });
  return proc as unknown as WorkerChild;
}

function armIdleEviction(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (inflight === 0) killChild();
  }, IDLE_MS);
}

/** What the worker accepts: an extraction (by path or bytes) or an in-place scrub. */
export type WorkerRequest =
  | { kind: "path"; path: string; locale: string }
  | { kind: "bytes"; data: string; name: string; mime?: string; locale: string }
  | { kind: "inplace"; data: string; name: string; mime: string; vault: Record<string, string>; disabledKinds?: string[]; kinds: Record<string, string> };

export function runInWorker(
  req: Extract<WorkerRequest, { kind: "path" | "bytes" }>,
  onProgress?: (done: number, pages: number) => void,
  onStream?: (ev: ExtractStreamEvent) => void,
  signal?: AbortSignal,
): Promise<ExtractedFile> {
  return runJob<ExtractedFile>(req, onProgress, onStream, signal);
}

/** One job on the worker; its result is the worker's `file` field, typed by the caller. A worker
 *  the system's jail could not start is tried once more, as the utilityProcess. */
export async function runJob<T>(
  req: WorkerRequest,
  onProgress?: (done: number, pages: number) => void,
  onStream?: (ev: ExtractStreamEvent) => void,
  signal?: AbortSignal,
): Promise<T> {
  try {
    return await runJobOnce<T>(req, onProgress, onStream, signal);
  } catch (e) {
    if (!(e instanceof SandboxUnbornError)) throw e;
    return runJobOnce<T>(req, onProgress, onStream, signal);
  }
}

async function runJobOnce<T>(
  req: WorkerRequest,
  onProgress?: (done: number, pages: number) => void,
  onStream?: (ev: ExtractStreamEvent) => void,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw new Error("extraction annulée");
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  inflight++;
  try {
    const c = ensureChild();
    const id = ++seq;
    return await new Promise<T>((resolve, reject) => {
      const startedAt = Date.now();
      // Past the deadline the job is in error AND its worker is killed: a worker still
      // spinning on that file would hold every later job behind it. A child that never
      // said `ready` was not born (header): that alone may fall back.
      const arm = (pages: number) =>
        setTimeout(() => {
          pending.delete(id);
          if (!readyChildren.has(c) && sandboxedChildren.has(c)) sandboxFailed = "pas prêt à temps";
          reject(readyChildren.has(c) ? new Error("extraction : délai dépassé") : sandboxedChildren.has(c) ? new SandboxUnbornError("pas prêt à temps") : new WorkerUnbornError("pas prêt à temps"));
          if (child === c) killChild();
        }, Math.max(0, startedAt + extractTimeoutMs(pages) - Date.now()));
      const entry: Pending = {
        resolve: resolve as (f: never) => void,
        reject,
        onProgress,
        onStream,
        timer: arm(0),
        scaledFor: 0,
        rescale: (pages) => {
          clearTimeout(entry.timer);
          entry.scaledFor = pages;
          entry.timer = arm(pages);
        },
      };
      pending.set(id, entry);
      // The user removed the file: concurrency is 1, so this job is the worker's only one —
      // killing it is the only way to stop a page mid-OCR. Detached first (`killChild`), so
      // the exit is « expected », never reported as a death; the next job forks afresh.
      signal?.addEventListener("abort", () => pending.has(id) && killChild(), { once: true });
      try {
        c.postMessage({ id, ...req, stream: !!onStream });
      } catch (err) {
        clearTimeout(entry.timer);
        pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  } finally {
    inflight--;
    armIdleEviction();
  }
}

/** The worker path, and only it: a worker that cannot be born refuses the document with
 *  `unavailable` (fail closed, see the header); any other failure is the job's, rethrown. */
export async function inWorkerOnly<T>(viaWorker: () => Promise<T>, unavailable: string): Promise<T> {
  try {
    return await viaWorker();
  } catch (e) {
    if (!(e instanceof WorkerUnbornError)) throw e;
    if (!unbornReported) reportMainError("ocr", "worker-unborn", e);
    unbornReported = true;
    throw new Error(unavailable);
  }
}
