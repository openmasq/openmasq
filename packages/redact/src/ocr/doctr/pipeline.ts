// Orchestration: image → det ONNX → DBNet boxes → crop batches → reco ONNX → CTC → words.
// The ONNX runtime + canvas are INJECTED (loaded lazily by the engine) so this stays
// import-time dependency-free.
import { ctcDecode } from "./ctc";
import { dbnetBoxes } from "./dbnet";
import { DET_SIZE, preprocessCrop, preprocessDet, RECO_H, RECO_W } from "./preprocess";

/* eslint-disable @typescript-eslint/no-explicit-any */

const RECO_BATCH = 128;
const CROP_LEN = 3 * RECO_H * RECO_W;

export interface DoctrRuntime {
  ort: any;
  canvas: any;
}

/** One recognised word: text, its ORIGINAL-pixel box `[x0,y0,x1,y1]`, and the CTC
 *  confidence (0–1) — the model's own certainty, used both as `OcrWord.confidence` and
 *  as the router's latin-vs-not signal. */
export interface DoctrWord {
  text: string;
  box: number[];
  confidence: number;
}

export interface DoctrPage {
  words: DoctrWord[];
  /** Detected boxes recognition could NOT read (empty CTC) — original-raster px. */
  unread: number[][];
  /** DBNet regions detected BEFORE recognition — the yield denominator. */
  regions: number;
  width: number;
  height: number;
}

export async function recognizePage(img: any, det: any, reco: any, rt: DoctrRuntime): Promise<DoctrPage> {
  const { ort, canvas } = rt;
  const prep = preprocessDet(img, canvas);
  const detOut = await det.run({
    input: new ort.Tensor("float32", prep.data, [1, 3, DET_SIZE, DET_SIZE]),
  });
  const boxes = dbnetBoxes(detOut.logits.data as Float32Array, prep);
  const page: DoctrPage = { words: [], unread: [], regions: boxes.length, width: prep.W, height: prep.H };
  if (boxes.length === 0) return page;

  for (let i = 0; i < boxes.length; i += RECO_BATCH) {
    const chunk = boxes.slice(i, i + RECO_BATCH);
    const buf = new Float32Array(chunk.length * CROP_LEN);
    for (let j = 0; j < chunk.length; j++) preprocessCrop(img, chunk[j], buf, j * CROP_LEN, canvas);
    const out = await reco.run({
      input: new ort.Tensor("float32", buf, [chunk.length, 3, RECO_H, RECO_W]),
    });
    const decoded = ctcDecode(out.logits.data as Float32Array, out.logits.dims as number[]);
    for (let j = 0; j < chunk.length; j++) {
      const { text, confidence } = decoded[j];
      if (text && text.trim()) page.words.push({ text, box: chunk[j], confidence });
      // A region the DETECTOR saw but the CRNN could not read (stamp, handwriting,
      // degraded band) used to vanish without trace — keep its box: it is the raw
      // material of zone reasoning, already computed in original-raster pixels.
      else page.unread.push(chunk[j]);
    }
  }
  return page;
}
