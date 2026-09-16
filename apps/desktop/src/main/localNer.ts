// Offline local PII detection (BERT NER) — the CLIENT of the `ner/worker.ts` utilityProcess,
// where the seconds of synchronous inference run OFF the main event loop. FAIL-CLOSED: a
// worker crash / spawn failure / timeout REJECTS, never a silent [] that would leak
// un-redacted PII. The worker (hundreds of MB) is KILLED after idle; the next call re-forks.
// Model dirs are computed HERE and passed via env; the app never fetches at runtime.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { app, utilityProcess, type UtilityProcess } from "electron";
import type { Detection } from "@openmasq/redact";
import { reportMainError } from "./runtime/errorReport";
import { isAppQuitting } from "./runtime/quitState";
import { BRAND } from "@openmasq/branding";

export interface DetectLocalPayload {
  text: string;
}

/**
 * The bundled models dir, the ONLY source (the app never downloads): packaged ⇒
 * `${resourcesPath}/ner-models`; dev ⇒ the bake output under `build/` (`pnpm bake:ner`).
 * Missing ⇒ "" ⇒ the engine is UNAVAILABLE, which BLOCKS the send (`sendGuards.ts`).
 * ⚠️ It does NOT degrade to the regex rules: that is the fail-open rule 7 forbids.
 */
const bundledNerDir = (): string => {
  const dir = app.isPackaged
    ? join(process.resourcesPath, "ner-models")
    : join(__dirname, "..", "..", "build", "ner-models"); // out/main → apps/desktop/build/…
  return existsSync(dir) ? dir : "";
};
const BUNDLED = bundledNerDir();

type Reply =
  | { id: number; ok: true; detections: Detection[] }
  | { id: number; ok: false; error: string };
interface Pending {
  resolve: (d: Detection[]) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// Cleanup backstop only: the renderer bounds a detection well before this
// (`send/redactTimeout.ts`). Reaps a pending entry if the worker wedged without exiting.
const DETECT_TIMEOUT_MS = 5 * 60 * 1000;
// Kill the worker (a large RAM floor: weights + onnxruntime session) after this idle.
const IDLE_MS = 10 * 60 * 1000;
/** Bounded stderr ring of the PACKAGED worker: the only trace of a native load failure,
 *  read back only in the report of an abnormal death. */
const STDERR_RING_MAX = 2000;
let stderrRing = "";

let child: UtilityProcess | null = null;
let seq = 0;
let inflight = 0;
let idleTimer: NodeJS.Timeout | null = null;
const pending = new Map<number, Pending>();

/** Reject every in-flight detection with `err` and clear the map (FAIL-CLOSED). */
function rejectAll(err: Error): void {
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(err);
  }
  pending.clear();
}

function killChild(): void {
  const c = child;
  child = null;
  rejectAll(new Error("moteur de détection locale arrêté"));
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
  const worker = join(__dirname, "nerWorker.js"); // emitted by electron-vite (main entry)
  const c = utilityProcess.fork(worker, [], {
    serviceName: `${BRAND.slug}-ner`,
    // MINIMAL env: only the model dir. NEVER a provider/app secret.
    env: { NER_BUNDLED_DIR: BUNDLED },
    // DEV: inherit, so a load crash is visible in the terminal. PACKAGED: "pipe" + the
    // ring. Safe by invariant: the worker NEVER writes `text` to stderr (ner/CLAUDE.md).
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
    clearTimeout(p.timer);
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.detections);
    else {
      // DEV: the worker's REAL error (no PII: an error string, not the input text).
      if (!app.isPackaged) console.error("[local-ner] detection failed:", msg.error);
      p.reject(new Error(msg.error));
    }
  });
  c.on("exit", (code) => {
    // An UNEXPECTED death only (idle eviction detaches `child` BEFORE killing).
    if (child === c && !isAppQuitting()) {
      reportMainError(
        "ner",
        `worker-exit-${code ?? "?"}`,
        new Error(`local-ner mort (code ${code})${stderrRing ? ` — stderr: ${stderrRing.slice(-400)}` : ""}`),
      );
    }
    // FAIL-CLOSED: every pending detection rejects.
    child = null;
    rejectAll(new Error("le moteur de détection locale s'est arrêté"));
  });
  child = c;
  return c;
}

/**
 * BEST-EFFORT warm-up (fork + weights + session: seconds on a weak machine), called on
 * window focus so the cold cost is paid BEFORE the user types. NEVER a guarantee: the send
 * keeps its fail-closed path and surfaces the real error.
 */
export function warmLocalNer(): void {
  if (!BUNDLED) return; // engine unavailable: the send will say so
  if (child) return; // already warm or currently loading
  detectLocalPii({ text: "bonjour" }).catch(() => {
    /* best-effort */
  });
}

/** REJECTS if the model can't load / the worker dies / it times out (the renderer fails
 *  closed); a successful run with no findings resolves to `[]`. */
export async function detectLocalPii(payload: DetectLocalPayload): Promise<Detection[]> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  inflight++;
  try {
    const c = ensureChild();
    const id = ++seq;
    return await new Promise<Detection[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("détection locale : délai dépassé"));
      }, DETECT_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      try {
        c.postMessage({ id, text: payload.text });
      } catch (err) {
        clearTimeout(timer);
        pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  } finally {
    inflight--;
    // Re-arm idle eviction; only kills when nothing is in flight.
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (inflight === 0) killChild();
    }, IDLE_MS);
  }
}
