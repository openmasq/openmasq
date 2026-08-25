import { describe, it, expect } from "vitest";
import { ctcDecode, VOCAB } from "./ctc";

const C = VOCAB.length + 1; // 126 vocab + blank
const BLANK = VOCAB.length;

/** Build a [1,T,C] logits Float32Array from a list of (class, peak-logit) per timestep;
 *  all other classes 0, so a high peak → high softmax confidence. */
function logitsOf(steps: [number, number][]): { data: Float32Array; dims: number[] } {
  const T = steps.length;
  const data = new Float32Array(T * C);
  steps.forEach(([cls, peak], t) => {
    data[t * C + cls] = peak;
  });
  return { data, dims: [1, T, C] };
}

const idx = (ch: string) => VOCAB.indexOf(ch);

describe("ctcDecode", () => {
  it("decodes a word and reports a high confidence when the model is peaky", () => {
    const { data, dims } = logitsOf([
      [idx("a"), 12],
      [idx("b"), 12],
      [BLANK, 12],
    ]);
    const [w] = ctcDecode(data, dims);
    expect(w.text).toBe("ab");
    expect(w.confidence).toBeGreaterThan(0.9);
  });

  it("collapses consecutive repeats and drops blanks (CTC best-path)", () => {
    const { data, dims } = logitsOf([
      [idx("l"), 10],
      [idx("l"), 10], // repeat → collapsed
      [BLANK, 10], // blank → dropped, resets prev
      [idx("l"), 10], // new run → emits again
    ]);
    expect(ctcDecode(data, dims)[0].text).toBe("ll");
  });

  it("reports LOW confidence when the distribution is flat (the non-latin signal)", () => {
    // Tiny peak over 127 near-equal classes → the argmax softmax prob is ~1/127.
    const { data, dims } = logitsOf([
      [idx("x"), 0.01],
      [BLANK, 0.01],
    ]);
    const [w] = ctcDecode(data, dims);
    expect(w.text).toBe("x");
    expect(w.confidence).toBeLessThan(0.2);
  });

  it("empty output has zero confidence", () => {
    const { data, dims } = logitsOf([[BLANK, 10]]);
    expect(ctcDecode(data, dims)[0]).toEqual({ text: "", confidence: 0 });
  });
});
