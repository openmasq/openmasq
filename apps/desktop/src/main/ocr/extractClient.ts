import { join } from "node:path";
import { app, utilityProcess, type UtilityProcess } from "electron";
import {
  extractText as extractTextInProcess,
  extractBytes as extractBytesInProcess,
  type ExtractedFile,
} from "@openmasq/redact/documents";
import { reportMainError } from "../runtime/errorReport";
import { isAppQuitting } from "../runtime/quitState";
import { BRAND } from "@openmasq/branding";

/**
 * CLIENT of the extraction worker (`extractWorker.ts`) — the documents counterpart of
 * `../localNer.ts`, for the same reason: extracting a scan cost bursts of
 * ~1 s of synchronous CPU IN main (IPC ping measured at 1,100 ms during OCR, 13/08), and
 * main is the process holding IPC, menus and windows. Lazy fork,
 * `{id, progress|result}` relay, idle eviction (tesseract WASM + docTR onnxruntime
 * sessions = a RAM floor we give back), an unexpected death reported NAMED.
 *
 * ⚠️ IN-PROCESS FALLBACK, and it is INTENDED: if the worker can't be BORN (spawn failed,
 * bundle missing), extraction falls back to the old path in main — same code, same
 * privileges, no security invariant crossed; we just get back the old latency.
 * An attachment that no longer attaches would be a worse regression than jank.
 * (Nothing to do with NER, where the equivalent fallback would be a redaction FAIL-OPEN.)
 */

type Reply =
  | { id: number; progress: { done: number; pages: number } }
  | { id: number; ok: true; file: ExtractedFile }
  | { id: number; ok: false; error: string };

interface Pending {
  resolve: (f: ExtractedFile) => void;
  reject: (e: Error) => void;
  onProgress?: (done: number, pages: number) => void;
  timer: ReturnType<typeof setTimeout>;
}

// Backstop only (a worker stuck without dying): OCR on a big scan on a
// low-power machine (Intel/WASM) is counted in minutes — generous, never the nominal bound.
const EXTRACT_TIMEOUT_MS = 6 * 60 * 1000;
// Tesseract WASM + docTR sessions are heavy: we give back the RAM after this idle period.
const IDLE_MS = 5 * 60 * 1000;
const STDERR_RING_MAX = 2000;
let stderrRing = "";

let child: UtilityProcess | null = null;
let seq = 0;
let inflight = 0;
let idleTimer: NodeJS.Timeout | null = null;
/** The fork failed once ⇒ in-process for the session (reported ONCE). */
let workerBroken = false;
/** The worker has already returned AT LEAST one result — this is what separates "it never
 *  gets born here" (in-process fallback) from "it died en route" (the next fork tries again). */
let everServed = false;
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

function ensureChild(): UtilityProcess {
  if (child) return child;
  const worker = join(__dirname, "extractWorker.js"); // emitted by electron-vite (main entry)
  const c = utilityProcess.fork(worker, [], {
    serviceName: `${BRAND.slug}-extract`,
    // MINIMAL env: only the OCR asset paths/pins that `runtime/ocrAssets.ts` set
    // on process.env at whenReady — NEVER the whole env (secrets). Absent (dev without
    // a bake) ⇒ the worker follows the same fallbacks as main (dev CDN / Tesseract-only).
    env: Object.fromEntries(
      ["OPENMASQ_TESSERACT_LANG_PATH", "OPENMASQ_DOCTR_MODEL_PATH", "OPENMASQ_DOCTR_INTEGRITY", "OPENMASQ_DOCTR_REQUIRE_PIN"]
        .filter((k) => process.env[k])
        .map((k) => [k, process.env[k] as string]),
    ),
    // Same contract as the NER worker: the worker NEVER writes the extracted text to
    // stdout/stderr — the bounded ring is only read back in the report of an abnormal death.
    stdio: app.isPackaged ? "pipe" : "inherit",
  });
  if (app.isPackaged) {
    c.stderr?.on("data", (d: Buffer) => {
      stderrRing = (stderrRing + String(d)).slice(-STDERR_RING_MAX);
    });
  }
  c.on("message", (msg: Reply) => {
    const p = pending.get(msg.id);
    if (!p) return;
    if ("progress" in msg) {
      p.onProgress?.(msg.progress.done, msg.progress.pages);
      return;
    }
    clearTimeout(p.timer);
    pending.delete(msg.id);
    if (msg.ok) {
      everServed = true;
      p.resolve(msg.file);
    } else p.reject(new Error(msg.error));
  });
  c.on("exit", (code) => {
    if (child === c && !isAppQuitting()) {
      reportMainError(
        "ocr",
        `worker-exit-${code ?? "?"}`,
        new Error(`extract-worker mort (code ${code})${stderrRing ? ` — stderr: ${stderrRing.slice(-400)}` : ""}`),
      );
    }
    child = null;
    rejectAll(new Error("le worker d'extraction s'est arrêté"));
  });
  child = c;
  return c;
}

function armIdleEviction(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (inflight === 0) killChild();
  }, IDLE_MS);
}

async function run(
  req:
    | { kind: "path"; path: string; ocrAllPages?: boolean }
    | { kind: "bytes"; data: string; name: string; mime?: string; ocrAllPages?: boolean },
  onProgress?: (done: number, pages: number) => void,
): Promise<ExtractedFile> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  inflight++;
  try {
    const c = ensureChild();
    const id = ++seq;
    return await new Promise<ExtractedFile>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("extraction : délai dépassé"));
      }, EXTRACT_TIMEOUT_MS);
      pending.set(id, { resolve, reject, onProgress, timer });
      try {
        c.postMessage({ id, ...req });
      } catch (err) {
        clearTimeout(timer);
        pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  } finally {
    inflight--;
    armIdleEviction();
  }
}

/** Has the in-process fallback taken over for this request? See the header. */
async function withFallback(
  viaWorker: () => Promise<ExtractedFile>,
  inProcess: () => Promise<ExtractedFile>,
): Promise<ExtractedFile> {
  if (workerBroken) return inProcess();
  try {
    return await viaWorker();
  } catch (e) {
    // A worker that has NEVER served = it isn't getting born here (missing bundle, spawn
    // refused): in-process for the session, said once. A worker that has already served
    // then dies, on the other hand, stays on the worker path (the next fork tries again).
    if (!everServed) {
      workerBroken = true;
      reportMainError("ocr", "worker-fallback-inprocess", e);
      return inProcess();
    }
    throw e;
  }
}

/** Extraction of a file on disk — worker first, in-process as session fallback. */
export function extractTextInWorker(
  filePath: string,
  onOcrProgress?: (done: number, pages: number) => void,
  /** "Read all": lift the OCR cap — threaded as-is through to the engine. */
  ocrAllPages?: boolean,
): Promise<ExtractedFile> {
  return withFallback(
    () => run({ kind: "path", path: filePath, ocrAllPages }, onOcrProgress),
    () => extractTextInProcess(filePath, onOcrProgress, ocrAllPages),
  );
}

/** Extraction of in-memory bytes (base64 on the IPC caller side) — same contract. */
export function extractBytesInWorker(
  bytes: Uint8Array,
  name: string,
  mime?: string,
  onOcrProgress?: (done: number, pages: number) => void,
  ocrAllPages?: boolean,
): Promise<ExtractedFile> {
  const data = Buffer.from(bytes).toString("base64");
  return withFallback(
    () => run({ kind: "bytes", data, name, mime, ocrAllPages }, onOcrProgress),
    () => extractBytesInProcess(bytes, name, mime, onOcrProgress, ocrAllPages),
  );
}
