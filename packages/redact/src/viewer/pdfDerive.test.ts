import { describe, expect, it } from "vitest";
import { pdfReplacements, type PartialMask, type RedactFn } from "./pdfDerive";

const finder =
  (values: string[]): RedactFn =>
  async (text) => ({
    text,
    matches: values.filter((v) => text.includes(v)).map((v) => ({ type: "secret", value: v, placeholder: `F_${v}`, category: "NAME" })),
  });

describe("pdfReplacements — the partial map a progressive preview reads", () => {
  it("reports, per chunk, the values found so far and a prefix no later chunk can start a value in", async () => {
    const filler = "lorem ipsum ".repeat(700);
    const text = `Alpha ${filler}\n${filler} Bravo`;
    const seen: PartialMask[] = [];
    await pdfReplacements(text, finder(["Alpha", "Bravo"]), { onProgress: (_d, _t, p) => seen.push(p) });
    expect(seen.length).toBeGreaterThan(1);
    const [first] = seen;
    // After chunk 1 only Alpha is known, and the covered prefix stops BEFORE the overlap.
    expect(first.replacements.map((r) => r.real)).toEqual(["Alpha"]);
    expect(first.covered).toBeLessThan(first.scanned);
    expect(first.scanned).toBeLessThan(text.length);
    // The last report covers the whole text with the final map.
    const last = seen[seen.length - 1];
    expect(last.covered).toBe(text.length);
    expect(last.scanned).toBe(text.length);
    expect(last.replacements.map((r) => r.real).sort()).toEqual(["Alpha", "Bravo"]);
  });

  it("never hands out the live array: a later chunk cannot rewrite a reported partial", async () => {
    const filler = "word ".repeat(1400);
    const seen: PartialMask[] = [];
    await pdfReplacements(`Alpha ${filler}\n${filler} Bravo`, finder(["Alpha", "Bravo"]), {
      onProgress: (_d, _t, p) => seen.push(p),
    });
    expect(seen[0].replacements).toHaveLength(1);
  });
});
