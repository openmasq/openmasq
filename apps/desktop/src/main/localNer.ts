// Offline local PII detection (BERT NER via transformers.js) for the "IA locale (hors-ligne)"
// redaction engine. Exposed as the `redact:detect-local` IPC (→ preload `detectLocalPii` →
// `Host.detectLocalPii`); returns the same verbatim `Detection[]` the LLM detector produces.
//
// The heavy inference (onnxruntime-node, SECONDS of synchronous CPU on a big snapshot) runs
// in a **utilityProcess worker** (`ner/worker.ts` → `nerWorker.js`), NOT the main process —
// a big page/document snapshot no longer freezes the main event loop (IPC / the agent-browser
// overlay). This file is the CLIENT: it forks the worker lazily, relays detect requests, and
// **preserves the FAIL-CLOSED guarantee** — a worker crash / spawn failure / timeout REJECTS
// (never a silent [] that would leak un-redacted free-form PII), and the renderer degrades to
// the pattern rules with a warning. The whole worker (hundreds of MB of weights + onnxruntime
// session) is KILLED after 10 min idle to free the RAM; the next call re-forks (weights cached
// on disk). Model dirs are computed HERE (the electron `app` API works in main) and passed to
// the worker via env — the desktop bundle loads 100% offline; there is NO download fallback
// (see the `modelsDir` note below and ner/worker.ts — the app never fetches at runtime).
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
 * The bundled models dir — **the ONLY source; the app never downloads** (see ner/worker.ts).
 *
 * SAME system in DEV as in prod (mirrors `runtime/ocrAssets.ts` for docTR): packaged ⇒
 * `${resourcesPath}/ner-models` (electron-builder `extraResources`); dev ⇒ the bake output
 * `apps/desktop/build/ner-models`, resolved from `__dirname` (= `out/main`). Dev used to
 * return "" here and rely on the worker's runtime DOWNLOAD — that fallback is gone, so
 * without this `pnpm dev` would have no local NER at all, however many times you baked.
 * Missing dir ⇒ "" ⇒ the engine is UNAVAILABLE, which BLOCKS the send (`sendGuards.ts`
 * `redactEngineUnavailable` → `RedactionUnavailableError`). Run `pnpm bake:ner`.
 * Never a fetch.
 *
 * ⚠️ It does NOT "degrade to the regex rules" — this comment used to say so, and that is
 * the exact fail-open root rule 7 forbids (regex-only on free-form PII leaks names and
 * orgs). Don't restore the sentence, and don't add the fallback it describes.
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

// Cleanup backstop only — the renderer bounds a detection well before this (≤45 s:
// `send/redactTimeout.ts`, applied by `makeRedactFn` AND by `raceRedactionWork` on the
// send's local passes — this second half MISSED a time for a while, and this backstop
// was then the only bound: bubble stuck for 5 min, dead Stop button). This just reaps a
// pending entry if the worker ever wedged without exiting.
const DETECT_TIMEOUT_MS = 5 * 60 * 1000;
// Kill the worker (a large RAM floor: weights + onnxruntime session) after this idle.
const IDLE_MS = 10 * 60 * 1000;
/** Stderr queue of the PACKAGED worker (bounded) — the only trace of a native load
 *  failure; read back only in the report of an abnormal death. */
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
    // MINIMAL env — only the model dirs. NEVER leak provider/app secrets into the worker.
    // The BUNDLED dir is the only model source — there is no download cache and no HF
    // revision to forward, because the worker never fetches (see ner/worker.ts loadPredict).
    env: { NER_BUNDLED_DIR: BUNDLED },
    // DEV: inherit — a hard model-LOAD crash (onnxruntime native / import failure) is
    // visible in the `pnpm dev` terminal. PACKAGED: "pipe" + the bounded ring below —
    // stderr is the ONLY trace of a native load failure for a user
    // (13/08 audit: on "ignore", the real error died in the pipe and the NER bug
    // stayed undiagnosable). Safe by invariant: the worker NEVER writes `text`
    // (the real PII) to stderr — see ner/CLAUDE.md; the ring is only read back in a
    // report of an abnormal death, never printed.
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
      // DEV DIAGNOSTIC: surface the worker's REAL error (model load / integrity / inference)
      // instead of the renderer's generic "couldn't load". No PII (it's an error
      // string, not the input text). TODO: remove once the NER load bug is diagnosed.
      if (!app.isPackaged) console.error("[local-ner] detection failed:", msg.error);
      p.reject(new Error(msg.error));
    }
  });
  c.on("exit", (code) => {
    // An UNEXPECTED death only: idle eviction (`killChild` detaches `child`
    // BEFORE killing) and the app closing are not crashes. The report carries the
    // worker's NAME + the code + the stderr queue (never the text — the worker's invariant).
    if (child === c && !isAppQuitting()) {
      reportMainError(
        "ner",
        `worker-exit-${code ?? "?"}`,
        new Error(`local-ner mort (code ${code})${stderrRing ? ` — stderr: ${stderrRing.slice(-400)}` : ""}`),
      );
    }
    // FAIL-CLOSED: a crashed/exited worker rejects every pending detection, so the renderer
    // fails closed instead of proceeding as if no PII was found.
    child = null;
    rejectAll(new Error("le moteur de détection locale s'est arrêté"));
  });
  child = c;
  return c;
}

/**
 * BEST-EFFORT warm-up of the engine (fork + sha256 of the weights + onnxruntime session:
 * several seconds on a weak machine — the "first redaction that doesn't respond").
 * The renderer already warms up on mount (`state/effects/usePlatformEffects.ts`), but only
 * once: after idle eviction (IDLE_MS), the next send would re-pay the whole cold cost
 * again. Called on `browser-window-focus`: the user comes back ⇒ we warm up BEFORE
 * they type. No-op if the worker is already alive, and NEVER a guarantee — the send keeps
 * its fail-closed path and surfaces the real error if the model doesn't load (rule 7:
 * a failure here hides nothing, it only forgoes the warm-up head start).
 */
export function warmLocalNer(): void {
  if (!BUNDLED) return; // engine unavailable: nothing to warm up, the send will say so
  if (child) return; // already warm or currently loading
  detectLocalPii({ text: "bonjour" }).catch(() => {
    /* best-effort — the send will surface the real error, that one will */
  });
}

/**
 * Detect free-form PII in `payload.text` using the offline BERT NER model, in the worker.
 * REJECTS if the model can't load / the worker dies / it times out — the renderer catches
 * that and fails closed. A successful run with no findings resolves to `[]`.
 */
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
