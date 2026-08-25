// CRNN CTC greedy decoding — faithful port of docTR's CTCPostProcessor.ctc_best_path:
// argmax over classes per timestep → collapse consecutive repeats (groupby) → drop blank.
// logits shape [N, T, C] with C = 127 (126 vocab + blank at index 126).
//
// EXTENSION over the benchmark: we ALSO return a per-word CONFIDENCE = the mean
// max-softmax probability over the timesteps that EMITTED a character. This is the
// model's OWN certainty and is the routing signal — on a script the latin CRNN can't
// read (CJK/Arabic/Cyrillic) the softmax is flat (low), so the router falls back to
// Tesseract. On clean latin text it is peaky (~1).
export const VOCAB =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~°£€¥¢฿àâéèêëîïôùûüçÀÂÉÈÊËÎÏÔÙÛÜÇ";

const BLANK = VOCAB.length; // 126

export interface CtcWord {
  text: string;
  /** Mean max-softmax over emitted timesteps, 0–1 (0 when nothing emitted). */
  confidence: number;
}

/** Softmax probability of class `best` at one timestep (numerically stable). */
function softmaxProb(logits: Float32Array, base: number, C: number, best: number, maxV: number): number {
  let sum = 0;
  for (let c = 0; c < C; c++) sum += Math.exp(logits[base + c] - maxV);
  return sum > 0 ? Math.exp(logits[base + best] - maxV) / sum : 0;
}

export function ctcDecode(logits: Float32Array, dims: number[]): CtcWord[] {
  const [N, T, C] = dims;
  const out: CtcWord[] = [];
  for (let n = 0; n < N; n++) {
    let prev = -1;
    let s = "";
    let probSum = 0;
    let emitted = 0;
    for (let t = 0; t < T; t++) {
      const base = (n * T + t) * C;
      let best = 0;
      let bestV = logits[base];
      for (let c = 1; c < C; c++) {
        const v = logits[base + c];
        if (v > bestV) {
          bestV = v;
          best = c;
        }
      }
      if (best !== prev) {
        if (best !== BLANK) {
          s += VOCAB[best];
          probSum += softmaxProb(logits, base, C, best, bestV);
          emitted++;
        }
        prev = best;
      }
    }
    out.push({ text: s, confidence: emitted ? probSum / emitted : 0 });
  }
  return out;
}
