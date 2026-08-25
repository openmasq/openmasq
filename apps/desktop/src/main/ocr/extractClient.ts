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
 * CLIENT du worker d'extraction (`extractWorker.ts`) — le pendant documents de
 * `../localNer.ts`, pour la même raison : l'extraction d'un scan coûtait des rafales de
 * ~1 s de CPU synchrone DANS main (ping IPC mesuré à 1 100 ms pendant l'OCR, 13/08), et
 * main est le processus qui tient l'IPC, les menus et les fenêtres. Fork paresseux,
 * relais `{id, progress|résultat}`, éviction d'inactivité (tesseract WASM + sessions
 * onnxruntime docTR = un plancher RAM qu'on rend), mort inattendue rapportée NOMMÉE.
 *
 * ⚠️ REPLI IN-PROCESS, et il est VOULU : si le worker ne peut pas NAÎTRE (spawn raté,
 * bundle absent), l'extraction retombe sur l'ancien chemin dans main — même code, mêmes
 * privilèges, aucun invariant de sécurité traversé ; on retrouve seulement la latence
 * d'avant. Une pièce jointe qui ne s'attache plus serait une régression pire que du jank.
 * (Rien à voir avec le NER, où le repli équivalent serait un FAIL-OPEN de redaction.)
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

// Backstop seulement (un worker coincé sans mourir) : l'OCR d'un gros scan sur un poste
// faible (Intel/WASM) se compte en minutes — large, jamais la borne nominale.
const EXTRACT_TIMEOUT_MS = 6 * 60 * 1000;
// Tesseract WASM + les sessions docTR pèsent : on rend la RAM après cette inactivité.
const IDLE_MS = 5 * 60 * 1000;
const STDERR_RING_MAX = 2000;
let stderrRing = "";

let child: UtilityProcess | null = null;
let seq = 0;
let inflight = 0;
let idleTimer: NodeJS.Timeout | null = null;
/** Le fork a échoué une fois ⇒ in-process pour la session (rapporté UNE fois). */
let workerBroken = false;
/** Le worker a déjà rendu AU MOINS un résultat — ce qui sépare « il ne naît pas ici »
 *  (repli in-process) de « il est mort en route » (le prochain fork repart). */
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
  child = null; // détaché AVANT kill : l'exit devient « attendu » pour le rapporteur
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
  const worker = join(__dirname, "extractWorker.js"); // émis par electron-vite (entrée main)
  const c = utilityProcess.fork(worker, [], {
    serviceName: `${BRAND.slug}-extract`,
    // Env MINIMAL : les seuls chemins/pins d'assets OCR que `runtime/ocrAssets.ts` a posés
    // sur process.env au whenReady — JAMAIS l'env entier (secrets). Absents (dev sans
    // bake) ⇒ le worker suit les mêmes replis que main (CDN dev / Tesseract-only).
    env: Object.fromEntries(
      ["OPENMASQ_TESSERACT_LANG_PATH", "OPENMASQ_DOCTR_MODEL_PATH", "OPENMASQ_DOCTR_INTEGRITY", "OPENMASQ_DOCTR_REQUIRE_PIN"]
        .filter((k) => process.env[k])
        .map((k) => [k, process.env[k] as string]),
    ),
    // Même contrat que le worker NER : le worker n'écrit JAMAIS le texte extrait sur
    // stdout/stderr — l'anneau borné n'est relu que dans le rapport d'une mort anormale.
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

/** Le repli in-process a-t-il pris la main pour cette requête ? Voir l'en-tête. */
async function withFallback(
  viaWorker: () => Promise<ExtractedFile>,
  inProcess: () => Promise<ExtractedFile>,
): Promise<ExtractedFile> {
  if (workerBroken) return inProcess();
  try {
    return await viaWorker();
  } catch (e) {
    // Un worker qui n'a JAMAIS servi = il ne naît pas ici (bundle manquant, spawn
    // refusé) : in-process pour la session, dit une fois. Un worker qui a déjà servi
    // puis meurt, lui, reste sur le chemin worker (le prochain fork repart).
    if (!everServed) {
      workerBroken = true;
      reportMainError("ocr", "worker-fallback-inprocess", e);
      return inProcess();
    }
    throw e;
  }
}

/** Extraction d'un fichier sur disque — worker d'abord, in-process en repli de session. */
export function extractTextInWorker(
  filePath: string,
  onOcrProgress?: (done: number, pages: number) => void,
  /** « Lire tout » : lever le plafond d'OCR — threadé tel quel jusqu'au moteur. */
  ocrAllPages?: boolean,
): Promise<ExtractedFile> {
  return withFallback(
    () => run({ kind: "path", path: filePath, ocrAllPages }, onOcrProgress),
    () => extractTextInProcess(filePath, onOcrProgress, ocrAllPages),
  );
}

/** Extraction d'octets en mémoire (base64 côté appelant IPC) — même contrat. */
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
