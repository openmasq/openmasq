// docTR OCR engine (onnxruntime-node + @napi-rs/canvas) — the LATIN-script engine.
// Implements the model-agnostic `OcrEngine`: encoded raster bytes → canonical `OcrPage`
// (top-left pixel boxes). db_mobilenet_v3_large (detection) + crnn_mobilenet_v3_small
// (recognition), self-exported first-party from Mindee's official weights.
//
// Node-only. The heavy deps are lazy-`import()`ed (never loaded unless docTR runs) and
// EXTERNAL in tsup — `onnxruntime-node` is consumer-supplied (like the NER path),
// `@napi-rs/canvas` is a package dep. The sessions load ONCE (lazy singleton).
//
// SECURITY (rule 7): each model file is sha256-VERIFIED against a bundled integrity
// manifest before it reaches onnxruntime (fail-closed — a tampered/substituted model is
// rejected). CPU execution is FORCED (target machines have no usable GPU).
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ocrWordsToText, type OcrWord } from "../layout";
import { doctrModelDir, type OcrEngine, type OcrPage } from "../engine";
import { recognizePage, type DoctrRuntime } from "./pipeline";

/* eslint-disable @typescript-eslint/no-explicit-any */

const DET_FILE = "db_mobilenet_v3_large";
const RECO_FILE = "crnn_mobilenet_v3_small";
const INTEGRITY_FILE = "integrity.json";

function int8(): boolean {
  return process.env.OPENMASQ_DOCTR_INT8 === "1";
}
function modelFile(stem: string): string {
  return `${stem}${int8() ? ".int8" : ""}.onnx`;
}

/** Lazy-load onnxruntime-node (consumer-supplied). A missing/broken module becomes a
 *  CLEAR FR error so the caller degrades gracefully (falls back to Tesseract). */
async function loadOrt(): Promise<any> {
  let mod: any;
  try {
    mod = await import("onnxruntime-node");
  } catch {
    throw new Error("moteur OCR docTR indisponible (onnxruntime-node manquant)");
  }
  const ort = mod?.InferenceSession ? mod : (mod?.default ?? mod);
  if (!ort?.InferenceSession?.create) {
    throw new Error("moteur OCR docTR incompatible (onnxruntime-node)");
  }
  return ort;
}

async function loadCanvas(): Promise<any> {
  let mod: any;
  try {
    mod = await import("@napi-rs/canvas");
  } catch {
    throw new Error("moteur de rendu indisponible (composant natif manquant)");
  }
  const resolved = typeof mod?.createCanvas === "function" ? mod : (mod?.default ?? mod);
  if (typeof resolved?.createCanvas !== "function" || typeof resolved?.loadImage !== "function") {
    throw new Error("moteur de rendu incompatible sur cet appareil");
  }
  return resolved;
}

/** CPU FORCED (no usable GPU on target machines) — every run is a real CPU number. */
function sessionOptions(): Record<string, unknown> {
  const threads = Number(process.env.OPENMASQ_DOCTR_THREADS || process.env.ORT_THREADS || "4");
  return {
    executionProviders: ["cpu"],
    intraOpNumThreads: Number.isFinite(threads) && threads > 0 ? threads : 4,
    interOpNumThreads: 1,
  };
}

/** Read the bundled integrity manifest `{ "<file>": "sha256-<hex>" }`, if present, or
 *  the `OPENMASQ_DOCTR_INTEGRITY` env override. Absent ⇒ no pin (dev / not-yet-baked). */
async function loadIntegrity(dir: string): Promise<Record<string, string> | null> {
  const raw = process.env.OPENMASQ_DOCTR_INTEGRITY;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as Record<string, string>;
    } catch {
      /* malformed env pin must not break OCR — fall through to the file manifest */
    }
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(await readFile(join(dir, INTEGRITY_FILE))));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : null;
  } catch {
    return null;
  }
}

/** Read a model file, sha256-verifying it against the manifest FIRST (fail-closed). */
async function readVerified(dir: string, file: string, pins: Record<string, string> | null): Promise<Uint8Array> {
  const bytes = await readFile(join(dir, file));
  const pin = pins?.[file];
  if (pin) {
    const got = `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
    const want = pin.startsWith("sha256-") ? pin : `sha256-${pin}`;
    if (got !== want) {
      throw new Error(`intégrité du modèle docTR invalide (${file})`);
    }
  } else if (process.env.OPENMASQ_DOCTR_REQUIRE_PIN === "1") {
    // Packaged builds set this so an UNPINNED model is rejected (defence in depth).
    throw new Error(`modèle docTR non épinglé (${file}) — refusé`);
  }
  return bytes;
}

interface Sessions {
  det: any;
  reco: any;
  rt: DoctrRuntime;
}
let sessionsPromise: Promise<Sessions> | null = null;

async function getSessions(): Promise<Sessions> {
  if (sessionsPromise) return sessionsPromise;
  sessionsPromise = (async () => {
    const dir = doctrModelDir();
    if (!dir) throw new Error("répertoire des modèles docTR non configuré");
    const [ort, canvas] = await Promise.all([loadOrt(), loadCanvas()]);
    const pins = await loadIntegrity(dir);
    const opts = sessionOptions();
    const [detBytes, recoBytes] = await Promise.all([
      readVerified(dir, modelFile(DET_FILE), pins),
      readVerified(dir, modelFile(RECO_FILE), pins),
    ]);
    const [det, reco] = await Promise.all([
      ort.InferenceSession.create(detBytes, opts),
      ort.InferenceSession.create(recoBytes, opts),
    ]);
    return { det, reco, rt: { ort, canvas } };
  })().catch((e) => {
    sessionsPromise = null; // let a later call retry (transient FS/native errors)
    throw e;
  });
  return sessionsPromise;
}

/** The singleton docTR engine. `recognize(bytes)` decodes the raster, runs det→reco, and
 *  maps to the canonical `OcrPage` (top-left px boxes, confidence 0–100, reading-order text). */
export const doctrEngine: OcrEngine = {
  id: "doctr",
  async recognize(bytes: Uint8Array): Promise<OcrPage> {
    const { det, reco, rt } = await getSessions();
    const img = await rt.canvas.loadImage(Buffer.from(bytes));
    const page = await recognizePage(img, det, reco, rt);
    const words: OcrWord[] = page.words.map((w) => ({
      text: w.text,
      x0: w.box[0],
      y0: w.box[1],
      x1: w.box[2],
      y1: w.box[3],
      confidence: Math.round(w.confidence * 100), // 0–100, same scale as Tesseract
    }));
    // Length-weighted mean confidence (0–1) — the routing signal.
    let cw = 0;
    let cc = 0;
    for (const w of page.words) {
      const len = Math.max(1, w.text.trim().length);
      cw += w.confidence * len;
      cc += len;
    }
    return {
      text: ocrWordsToText(words),
      words,
      width: page.width,
      height: page.height,
      regions: page.regions,
      meanConfidence: cc ? cw / cc : 0,
      unreadBoxes: page.unread.map((b) => [b[0], b[1], b[2], b[3]] as [number, number, number, number]),
    };
  },
};

/** Reset the cached sessions (tests / a model-path change). */
export function resetDoctrSessions(): void {
  sessionsPromise = null;
}
