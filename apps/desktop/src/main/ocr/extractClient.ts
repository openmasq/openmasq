import { app } from "electron";
import type { ExtractedFile, ExtractStreamEvent } from "@openmasq/redact/documents";
import { reportMainError } from "../runtime/errorReport";
import { isAppQuitting } from "../runtime/quitState";
import { extractTimeoutMs } from "@openmasq/redact";
import { checkExtracted, checkInplace } from "./extractAnswer";
import { checkStreamMessage } from "./extractStream";
import { SandboxUnbornError, type WorkerChild } from "./extractSandbox";
import { bornWorker, unwalledAllowed, WorkerUnbornError } from "./extractWall";

/**
 * CLIENT of the extraction worker (`extractWorker.ts`) — the documents counterpart of
 * `../localNer.ts`, for the same reason: extracting a scan cost bursts of
 * ~1 s of synchronous CPU IN main (IPC ping measured at 1,100 ms during OCR, 13/08), and
 * main is the process holding IPC, menus and windows. Lazy fork,
 * `{id, progress|result}` relay, idle eviction (tesseract WASM + docTR onnxruntime
 * sessions = a RAM floor we give back), an unexpected death reported NAMED.
 *
 * ⛔ NO IN-PROCESS FALLBACK, AND NO UNWALLED ONE IN A PACKAGED APP. Main never parses a document:
 * a crafted file meets the parsers (pdf.js, the office readers, the image decoders) only in the
 * worker, and a packaged app's worker runs inside the system's jail or not at all
 * (`extractWall.ts`). A worker that cannot be BORN (no jail, the bundle is missing or changed,
 * the start throws, or the child dies/stalls before its `ready`) fails CLOSED: the document is
 * refused with a sentence saying the reader is unavailable (`inWorkerOnly`). A job that fails
 * AFTER `ready` (timeout, crash) failed because of its FILE: that file is in error, and the next
 * one gets a fresh worker — as after a WORKBOOK (`recycle`). A worker main STOPPED for passing
 * its memory or its folder's cap says so (`WorkerOverError`): the person is told the true reason.
 * Its final answer is rebuilt before use (`extractAnswer.ts`); messages nothing asked for stop it.
 */
export { WorkerUnbornError };

/** Main stopped the worker: this document needs more memory, or more room, than the reader may use. */
export class WorkerOverError extends Error {
  constructor(readonly why: "memory" | "disk") {
    super(`worker d'extraction arrêté (${why})`);
    this.name = "WorkerOverError";
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
  /** the answer's shape, rebuilt (`extractAnswer.ts`); null refuses it */
  check: (file: unknown) => unknown | null;
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
/** UNPACKAGED runs only: the system's jail did not start once, so the utilityProcess for the session, and why */
let sandboxFailed: string | null = null;
/** messages no job asked for, per worker: past this many the worker is stopped */
const STRAY_MAX = 32;
const strays = new WeakMap<WorkerChild, number>();
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
  // shut in by the system; a packaged app that cannot is refused there (`extractWall.ts`)
  const { child: c, shut } = bornWorker(!!sandboxFailed);
  if (shut) sandboxedChildren.add(c);
  isolation = shut ? "system" : "process";
  if (app.isPackaged || shut) {
    c.stderr?.on("data", (d: Buffer) => {
      stderrRing = (stderrRing + String(d)).slice(-STDERR_RING_MAX);
    });
  }
  c.on("message", (msg: Reply) => {
    if (!msg || typeof msg !== "object") return;
    if ("ready" in msg) {
      readyChildren.add(c);
      return;
    }
    const p = pending.get(msg.id);
    if (!p) {
      // nothing asked for it: a worker that keeps talking is no longer ours to listen to
      const n = (strays.get(c) ?? 0) + 1;
      strays.set(c, n);
      if (n > STRAY_MAX && child === c) killChild();
      return;
    }
    if ("progress" in msg) {
      if (typeof msg.progress?.done !== "number" || typeof msg.progress.pages !== "number") return;
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
    const file = msg.ok ? p.check(msg.file) : null;
    if (msg.ok && file) p.resolve(file as never);
    else p.reject(new Error(msg.ok ? "réponse du lecteur refusée" : String(msg.error).slice(0, 2000)));
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
    const over = c.stopped?.();
    rejectAll(over === "memory" || over === "disk" ? new WorkerOverError(over) : readyChildren.has(c) ? new Error("le worker d'extraction s'est arrêté") : unborn(c, `arrêté avant d'être prêt (code ${code}${stderrRing ? `: ${stderrRing.slice(-300)}` : ""})`));
  });
  child = c;
  return c;
}

/** A worker that never said `ready`. Packaged: the document is refused, and the next one tries
 *  the jail again. Unpackaged, a jailed one falls back to the utilityProcess for the session. */
function unborn(c: WorkerChild, cause: string): Error {
  if (!sandboxedChildren.has(c) || !unwalledAllowed()) return new WorkerUnbornError(cause);
  sandboxFailed = cause;
  return new SandboxUnbornError(cause);
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

/** One job on the worker; its result is the worker's `file` field, checked and typed by the caller.
 *  In an UNPACKAGED run a worker the system's jail could not start is tried once more, as the
 *  utilityProcess (`SandboxUnbornError` is never thrown by a packaged app: `unborn`). */
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
          reject(readyChildren.has(c) ? new Error("extraction : délai dépassé") : unborn(c, "pas prêt à temps"));
          if (child === c) killChild();
        }, Math.max(0, startedAt + extractTimeoutMs(pages) - Date.now()));
      const entry: Pending = {
        check: req.kind === "inplace" ? checkInplace : checkExtracted,
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
 *  `unavailable`, one main stopped for its memory or its folder with `over`'s sentence (fail
 *  closed, see the header); any other failure is the job's, rethrown. */
export async function inWorkerOnly<T>(viaWorker: () => Promise<T>, unavailable: string, over?: Record<"memory" | "disk", string>): Promise<T> {
  try {
    return await viaWorker();
  } catch (e) {
    if (e instanceof WorkerOverError) {
      reportMainError("ocr", `worker-over-${e.why}`, e);
      throw new Error(over?.[e.why] ?? unavailable);
    }
    if (!(e instanceof WorkerUnbornError)) throw e;
    if (!unbornReported) reportMainError("ocr", "worker-unborn", e);
    unbornReported = true;
    throw new Error(unavailable);
  }
}
