// CLIENT for the embed worker (`worker.ts` → out/main/embedWorker.js): forks lazily,
// relays batches, kills the worker after idle to reclaim the weights + onnxruntime
// session (another process's RAM — the `../localNer.ts` pattern). A worker crash or
// spawn failure REJECTS every in-flight request; the memory index then simply reports
// unavailable (no security fallback is involved — clustering is a feature, and the
// redaction pipeline is untouched either way).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { app, utilityProcess, type UtilityProcess } from "electron";
import { reportMainError } from "../runtime/errorReport";
import { isAppQuitting } from "../runtime/quitState";
import { BRAND } from "@openmasq/branding";

/** Bundled models dir — packaged: extraResources; dev: the bake output (like NER/docTR).
 *  Missing ⇒ "" ⇒ the index is unavailable (`pnpm bake:embed`). Never a fetch.
 *  ⚠️ Resolved LAZILY and memoised, never at module load: reading `app` at import time
 *  makes merely IMPORTING this file (transitively — `../fs/findFiles.ts` does) throw in
 *  any context where Electron isn't fully up, which is every unit test that mocks only
 *  the part of `electron` it needs. The value is stable for the process either way. */
let bundled: string | undefined;
const bundledEmbedDir = (): string => {
  if (bundled === undefined) {
    const dir = app.isPackaged
      ? join(process.resourcesPath, "embed-models")
      : join(__dirname, "..", "..", "build", "embed-models"); // out/main → apps/desktop/build/…
    bundled = existsSync(dir) ? dir : "";
  }
  return bundled;
};

/** Whether the on-device embedder can run at all (bundle present). */
export const embedAvailable = (): boolean => Boolean(bundledEmbedDir());

type Reply =
  | { id: number; ok: true; vectors: number[][] }
  | { id: number; ok: false; error: string };
interface Pending {
  resolve: (v: number[][]) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const EMBED_TIMEOUT_MS = 2 * 60 * 1000;
const IDLE_MS = 5 * 60 * 1000;

let child: UtilityProcess | null = null;
let seq = 0;
let inflight = 0;
let idleTimer: NodeJS.Timeout | null = null;
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
  child = null;
  rejectAll(new Error("embedder arrêté"));
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
  const worker = join(__dirname, "embedWorker.js");
  const c = utilityProcess.fork(worker, [], {
    serviceName: `${BRAND.slug}-embed`,
    // MINIMAL env — the bundle dir only; the worker never logs the texts (real PII).
    env: { EMBED_BUNDLED_DIR: bundledEmbedDir() },
    stdio: app.isPackaged ? "ignore" : "inherit",
  });
  c.on("message", (msg: Reply) => {
    const p = pending.get(msg.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.vectors);
    else p.reject(new Error(msg.error));
  });
  c.on("exit", (code) => {
    // Mort INATTENDUE seulement (l'éviction d'inactivité détache `child` avant de tuer,
    // la fermeture de l'app passe par `isAppQuitting`) — rapportée NOMMÉE : sans ça, un
    // embed tué OOM sous ses 120 Mo de poids ne laissait aucune trace (audit 13/08).
    if (child === c && !isAppQuitting()) {
      reportMainError("embed", `worker-exit-${code ?? "?"}`, new Error(`embed-worker mort (code ${code})`));
    }
    child = null;
    rejectAll(new Error("l'embedder s'est arrêté"));
  });
  child = c;
  return c;
}

/** Embed a batch of (already-prefixed) texts. Rejects on load/integrity/inference
 *  failure or worker death — the caller treats that as "index unavailable". */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!bundledEmbedDir()) throw new Error("embed model not bundled — run `pnpm bake:embed`");
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  inflight++;
  try {
    const c = ensureChild();
    const id = ++seq;
    return await new Promise<number[][]>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("embedding : délai dépassé"));
      }, EMBED_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      try {
        c.postMessage({ id, texts });
      } catch (err) {
        clearTimeout(timer);
        pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  } finally {
    inflight--;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (inflight === 0) killChild();
    }, IDLE_MS);
  }
}
