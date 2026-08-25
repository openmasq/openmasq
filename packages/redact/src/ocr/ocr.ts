// OCR — text recovery for SCANNED documents (image-only PDFs) and image files.
// Node-only: all heavy libs (tesseract.js, pdfjs-dist, @napi-rs/canvas) are
// lazy-`import()`ed inside the functions so they NEVER load unless OCR actually
// runs, and never reach the renderer bundle (imported only via ./documents).
//
// Caveats (see CLAUDE.md): tesseract.js downloads its wasm core + traineddata on
// FIRST use (needs network once; cached under os.tmpdir() afterwards), and
// @napi-rs/canvas ships a prebuilt native binary that electron-builder must
// package per-platform. Failures throw a clear Error the caller catches.
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brandKey } from "@openmasq/branding";
import { OCR_LANGS, OCR_TRAINEDDATA_SHA256, type OcrMeta } from "../documents/core";
import { ocrWordsToText, type OcrWord } from "./layout";
import { preferDoctr, doctrModelDir, type OcrEngine, type OcrPage } from "./engine";
import { garbledBoxes, isGarbledWord, type GarbledRect } from "./garbled";

/** Flatten a tesseract.js v5 result (`{ blocks: true }` output) into positioned
 *  words. Walks blocks→paragraphs→lines→words; falls back to a flat `data.words`
 *  when present. Defensive: skips anything without a usable bbox. */
function extractOcrWords(data: any): OcrWord[] {
  const words: OcrWord[] = [];
  const push = (w: any) => {
    const b = w?.bbox;
    if (!w?.text || !b) return;
    const x0 = Number(b.x0), y0 = Number(b.y0), x1 = Number(b.x1), y1 = Number(b.y1);
    if (![x0, y0, x1, y1].every(Number.isFinite)) return;
    words.push({
      text: String(w.text),
      x0,
      y0,
      x1,
      y1,
      confidence: typeof w.confidence === "number" ? w.confidence : undefined,
    });
  };
  if (Array.isArray(data?.words)) data.words.forEach(push);
  else
    for (const bl of data?.blocks ?? [])
      for (const par of bl?.paragraphs ?? [])
        for (const ln of par?.lines ?? [])
          for (const w of ln?.words ?? []) push(w);
  return words;
}

// Shared with the extension (bundled traineddata) — one source of truth. The
// Node path fetches each on first use and caches under tmpdir.
const DEFAULT_LANG = OCR_LANGS.join("+");
const CACHE_DIR = join(tmpdir(), brandKey("tesseract"));

/** OCR worker options (audit H6). We use the vendored, hardened **`tesseract2.js`** instead
 *  of `tesseract.js`: its WASM core is loaded from the BUNDLED `tesseract.js-core` npm
 *  package (NO CDN fetch of executable WASM into this privileged process — the H6 core
 *  vector is gone), the worker runs in a `worker_threads` Worker, and `<lang>.traineddata`
 *  can be pinned. `OPENMASQ_TESSERACT_LANG_PATH` → a local (signed, bundled) traineddata dir
 *  so the language data is loaded offline; `OPENMASQ_TESSERACT_INTEGRITY` → a JSON map
 *  `{ "<lang>": "sha256-<base64>" }` verified before the traineddata reaches the parser.
 *  Unset (dev / not-yet-baked) → tesseract2 downloads https-only, redirect-scheme-checked,
 *  size-capped traineddata into `cachePath`. */
function tesseract2Options(): Record<string, unknown> {
  const o: Record<string, unknown> = { cachePath: CACHE_DIR };
  const langPath = process.env.OPENMASQ_TESSERACT_LANG_PATH;
  if (langPath) {
    // Bundled, SIGNED, offline traineddata dir (packaged desktop). The baked files are
    // UNCOMPRESSED `<lang>.traineddata`, so read them raw (`gzip:false`) — matching the
    // `bake:tesseract` layout + the extension bundle. And pin their integrity by DEFAULT
    // (audit M8): `OCR_TRAINEDDATA_SHA256` (verified against official tessdata_fast) is
    // checked before the bytes reach the WASM parser. We only pin on the bundled path
    // because the dev CDN fallback (`4.0.0_best_int`) serves DIFFERENT bytes.
    o.langPath = langPath;
    o.gzip = false;
    o.integrity = OCR_TRAINEDDATA_SHA256;
  }
  // Explicit env override wins (e.g. a custom bundled set): a JSON `{ "<lang>": "sha256-…" }`.
  const integrityRaw = process.env.OPENMASQ_TESSERACT_INTEGRITY;
  if (integrityRaw) {
    try {
      const parsed = JSON.parse(integrityRaw);
      if (parsed && typeof parsed === "object") o.integrity = parsed;
    } catch {
      // A malformed pin env must not break OCR — keep the default pin above.
    }
  }
  return o;
}

/**
 * Load the vendored `tesseract2.js` and return its `createWorker`. A MISSING/broken
 * module surfaces as a raw "Cannot find package …app.asar/…" internal path that must never
 * reach the user — turn it into a CLEAR, actionable FR error so the caller degrades
 * gracefully (the image still attaches, just without OCR).
 */
async function loadTesseract(): Promise<any> {
  let mod: any;
  try {
    mod = await import("tesseract2.js");
  } catch {
    throw new Error(
      "moteur OCR indisponible (tesseract2.js n'a pas pu être chargé — module manquant) — réinstallez l'application",
    );
  }
  const createWorker = mod?.createWorker ?? mod?.default?.createWorker;
  if (typeof createWorker !== "function") {
    throw new Error(
      "moteur OCR incompatible (tesseract2.js) — réinstallez l'application",
    );
  }
  return createWorker;
}

/**
 * OCR a single image buffer → recognised text (trimmed). LAYOUT-AWARE: we request
 * positioned output (`{ blocks: true }`) and rebuild the reading order + columns
 * (`ocrWordsToText`) so a scanned FORM's `label : value` pairs and table columns
 * survive OCR instead of scrambling — which materially improves detection by BOTH
 * the LLM model detector and the local NER (they consume this same text). Falls back
 * to the flat `data.text` if a version/engine returns no geometry. Throws on failure.
 */
export async function ocrImage(buf: Uint8Array, lang: string = DEFAULT_LANG): Promise<string> {
  return (await ocrImageLayout(buf, lang)).text;
}

/**
 * Like {@link ocrImage} but ALSO returns the positioned words (original pixel boxes)
 * — so a consumer can paint the redaction on the scan (`imageRedact.renderRedactedImage`)
 * instead of only redacting the text. Same layout-aware `text`; `words` are the raw
 * Tesseract boxes (top-left px), filtered to non-empty by the layout step downstream.
 *
 * **This is the OCR ROUTER.** When the docTR models are bundled (`OPENMASQ_DOCTR_MODEL_PATH`,
 * desktop-only, once baked) it runs docTR FIRST — far higher accuracy on LATIN scripts —
 * and keeps that result when `preferDoctr` judges it confidently latin; on a low-confidence
 * / non-latin page (CJK/Arabic/Cyrillic, which docTR's latin CRNN can't read) it FALLS BACK
 * to Tesseract (12-language coverage). docTR unavailable / failing ⇒ Tesseract, unchanged.
 * The fallback is the SAFE direction (Tesseract reads what docTR couldn't — never a leak).
 */
export async function ocrImageLayout(
  buf: Uint8Array,
  lang: string = DEFAULT_LANG,
): Promise<{
  text: string;
  words: OcrWord[];
  meta: OcrMeta;
  /** Raster dims the word boxes are relative to. docTR: exact; Tesseract: approximated
   *  by the boxes' extent (it reports no page dims) — good enough to SCALE, and what
   *  gives an IMAGE attachment an `ocrPages` entry at all (spatial reasoning needs it). */
  width: number;
  height: number;
  /** Detector-found-but-unread boxes (docTR only) — see {@link OcrPage.unreadBoxes}. */
  unreadBoxes?: [number, number, number, number][];
}> {
  const t0 = Date.now();
  let triedDoctr = false;
  if (doctrModelDir()) {
    try {
      const page = await doctrRecognize(buf);
      triedDoctr = true;
      if (preferDoctr(page)) {
        // Une page gagnée par docTR peut contenir des régions rendues en DÉBRIS — la
        // bande MRZ d'une CNI, détectée mais « - » (hors vocabulaire CTC, confiance
        // au-dessus du plancher). Ces boîtes-là sont relues par Tesseract sur leur
        // rectangle : le sens SÛR du routeur, région par région (`garbled.ts`).
        const suspects = garbledBoxes(page.words, page);
        let words = page.words;
        let text = page.text;
        let engine = "doctr";
        if (suspects.length) {
          try {
            const relus = await tesseractRects(buf, lang, suspects);
            if (relus.length) {
              words = [...words.filter((w) => !isGarbledWord(w, suspects)), ...relus];
              // QUARANTAINE, pas re-sérialisation : le texte docTR d'origine reste
              // INTACT (les règles à contexte — « Né(e) le », le libellé CNI — jugent
              // sur SA mise en page ; tout recomposer les cassait, mesuré), et les
              // lignes relues s'apposent en bloc à la fin — même motif que le texte
              // pivoté de `pdfLayout` (`reconstructLayout`, « quarantined »).
              text = `${page.text}\n\n${ocrWordsToText(relus)}`;
              engine = "doctr+tesseract";
            }
          } catch {
            /* la relecture est un bonus — docTR seul, comme avant */
          }
        }
        return {
          text,
          words,
          meta: { engine, ms: Date.now() - t0, confidence: page.meanConfidence },
          width: page.width,
          height: page.height,
          unreadBoxes: page.unreadBoxes,
        };
      }
      // Low confidence / non-latin script → fall through to Tesseract (broad coverage).
    } catch (e) {
      // A docTR failure must never break OCR — degrade to Tesseract (fail-safe).
      console.warn("[ocr] docTR échec, repli sur Tesseract:", (e as Error)?.message);
    }
  }
  const r = await tesseractLayout(buf, lang);
  return {
    ...r,
    meta: { engine: "tesseract", ms: Date.now() - t0, fellBack: triedDoctr },
    width: r.words.reduce((m, w) => Math.max(m, w.x1), 0),
    height: r.words.reduce((m, w) => Math.max(m, w.y1), 0),
  };
}

/** Lazy-load the docTR engine (Node-only, heavy ONNX deps) and recognise one raster. */
async function doctrRecognize(buf: Uint8Array): Promise<OcrPage> {
  const { doctrEngine } = await import("./doctr");
  return doctrEngine.recognize(buf);
}

/** Relecture CIBLÉE des régions-débris (`garbled.ts`) : un worker, un `SetRectangle` par
 *  boîte — l'API Tesseract ne ré-origine pas ses coordonnées, les mots relus retombent
 *  donc en place dans l'espace pleine image, prêts à fusionner avec ceux de docTR. */
async function tesseractRects(buf: Uint8Array, lang: string, rects: readonly GarbledRect[]): Promise<OcrWord[]> {
  const createWorker = await loadTesseract();
  const worker = await createWorker(lang, 1, tesseract2Options());
  try {
    const out: OcrWord[] = [];
    for (const rectangle of rects) {
      const { data } = await worker.recognize(Buffer.from(buf), { rectangle }, { text: true, blocks: true });
      out.push(...extractOcrWords(data));
    }
    return out;
  } finally {
    await worker.terminate();
  }
}

/** The Tesseract path (the fallback engine). Same layout-aware `{text, words}` contract. */
async function tesseractLayout(
  buf: Uint8Array,
  lang: string = DEFAULT_LANG,
): Promise<{ text: string; words: OcrWord[] }> {
  const createWorker = await loadTesseract();
  const worker = await createWorker(lang, 1, tesseract2Options());
  try {
    const { data } = await worker.recognize(Buffer.from(buf), {}, { text: true, blocks: true });
    const words = extractOcrWords(data);
    const text = (words.length ? ocrWordsToText(words) : String(data?.text ?? "")).trim();
    return { text, words };
  } finally {
    await worker.terminate();
  }
}

/** Tesseract wrapped as an {@link OcrEngine} — so the router treats every engine uniformly
 *  and "add another OCR model" is just "implement `OcrEngine`". `regions`/`meanConfidence`
 *  are unreported (Tesseract has no separate detect stage / comparable confidence). */
export const tesseractEngine: OcrEngine = {
  id: "tesseract",
  async recognize(bytes: Uint8Array, lang: string = DEFAULT_LANG): Promise<OcrPage> {
    const { text, words } = await tesseractLayout(bytes, lang);
    const width = words.reduce((m, w) => Math.max(m, w.x1), 0);
    const height = words.reduce((m, w) => Math.max(m, w.y1), 0);
    return { text, words, width, height };
  },
};
