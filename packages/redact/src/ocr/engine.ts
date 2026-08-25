// The MODEL-AGNOSTIC OCR contract. Any OCR engine (Tesseract, docTR, a future model)
// maps its native output to `OcrPage` — a page of `OcrWord`s in ONE canonical
// coordinate system (TOP-left origin, pixel units, raster/canvas-relative) — so every
// downstream consumer (imageRedact box paint, `ocrWordsToLayout` reading order) is
// engine-BLIND. Swapping or adding a model is "implement `OcrEngine`", nothing else.
//
// Pure + dependency-free (no Node/ONNX/canvas) so it is unit-testable and safe to import
// anywhere; the heavy engines live behind lazy imports in `../ocr` (Tesseract) and
// `../doctr` (docTR).
import type { OcrWord } from "./layout";

export type { OcrWord };

/** One OCR'd page: the reading-order text + its positioned words, plus optional
 *  engine-agnostic routing signals. Coordinates are TOP-left pixels (see `OcrWord`). */
export interface OcrPage {
  /** Layout-aware reading-order text (built via `ocrWordsToText`). */
  text: string;
  /** Positioned words with their pixel boxes (top-left origin). The STANDARD box. */
  words: OcrWord[];
  /** Raster width/height the boxes are relative to. */
  width: number;
  height: number;
  /**
   * Text regions the DETECTOR found BEFORE recognition (engine-agnostic — docTR's DBNet
   * blob count). Lets the router measure recognition YIELD (`words / regions`).
   * Undefined ⇒ not reported (e.g. Tesseract, which has no separate detect stage).
   */
  regions?: number;
  /**
   * Mean recognition confidence 0–1 across words (length-weighted). For docTR this is the
   * CTC max-softmax — the model's OWN uncertainty, which drops on a script it can't read.
   * Undefined ⇒ not reported.
   */
  meanConfidence?: number;
  /**
   * Boxes the DETECTOR found that recognition could NOT read (empty CTC output) —
   * `[x0, y0, x1, y1]` in the same top-left raster pixels as `words`. This is the raw
   * material of « une zone détectée mais illisible » (a stamp, handwriting, a degraded
   * MRZ band): it used to be silently dropped, which is the opposite of fail-closed for
   * a scan. Undefined ⇒ engine has no separate detect stage (Tesseract).
   */
  unreadBoxes?: [number, number, number, number][];
}

/** A pluggable OCR engine. `recognize` takes an ENCODED raster (png/jpg/… bytes) and
 *  returns a canonical `OcrPage`. `lang` is an optional hint (used by Tesseract; docTR
 *  is fixed-vocabulary and ignores it). */
export interface OcrEngine {
  readonly id: string;
  recognize(bytes: Uint8Array, lang?: string): Promise<OcrPage>;
}

/** The bundled docTR model directory, if configured. Set by the desktop host once the
 *  models are baked + integrity-pinned (`OPENMASQ_DOCTR_MODEL_PATH`). ABSENT ⇒ docTR is
 *  off and OCR is Tesseract-only (mobile / web / dev-before-bake) — behaviour unchanged. */
export function doctrModelDir(): string | undefined {
  const d = process.env.OPENMASQ_DOCTR_MODEL_PATH;
  return d && d.trim() ? d : undefined;
}

function num(v: string | undefined, dflt: number): number {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : dflt;
}

// Routing thresholds (env-tunable). Tesseract is the SAFE fallback — far broader language
// coverage (12 langs incl. CJK/Arabic/Cyrillic) than docTR's latin-only CRNN — so we KEEP
// docTR only when it is CONFIDENTLY reading a latin script, and fall back otherwise.
const MIN_CONFIDENCE = num(process.env.OPENMASQ_DOCTR_MIN_CONFIDENCE, 0.5);
const MIN_YIELD = num(process.env.OPENMASQ_DOCTR_MIN_YIELD, 0.45);

/**
 * Should we TRUST docTR's result for this page, i.e. is the text a LATIN script docTR can
 * actually read? docTR's DETECTION (DBNet) is script-agnostic and strong, but its
 * RECOGNITION (CRNN) is latin-only — so on a CJK / Arabic / Cyrillic scan it still finds
 * regions yet recognises them with LOW CTC confidence and/or FEW words. The model's own
 * confidence is the routing signal: below the floors ⇒ fall back to Tesseract (broad
 * language coverage). Erring toward fallback is the fail-safe direction (never a leak —
 * Tesseract simply reads what docTR couldn't). Pure + unit-tested.
 */
export function preferDoctr(page: OcrPage): boolean {
  const regions = page.regions ?? page.words.length;
  if (regions === 0) return false; // detected nothing → let Tesseract try
  const yieldRatio = page.words.length / regions;
  const conf = page.meanConfidence ?? 0;
  return conf >= MIN_CONFIDENCE && yieldRatio >= MIN_YIELD;
}
