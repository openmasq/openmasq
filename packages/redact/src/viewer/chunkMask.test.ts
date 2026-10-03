import { describe, expect, it } from "vitest";
import { createChunkMasker, DIVERGED, pdfReplacements, type PartialMask, type RedactFn } from "./chunkMask";

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

describe("createChunkMasker — masking as the text is read", () => {
  const PAGES = 26;
  const page = (n: number) => `Page ${n} ${"relevé opération débit crédit ".repeat(90)} Client${n}\n`;
  const pages = Array.from({ length: PAGES }, (_, i) => page(i + 1));
  const whole = pages.join("\n\f\n");
  // Deterministic, and records every text it is asked to mask.
  const recording = (values: string[]) => {
    const calls: string[] = [];
    const fn: RedactFn = async (text, _s, vault) => {
      calls.push(text);
      const matches = values
        .filter((v) => text.includes(v))
        .map((v) => {
          const fake = Object.entries(vault ?? {}).find(([, r]) => r === v)?.[0] ?? `F_${v}`;
          if (vault) vault[fake] = v;
          return { type: "secret" as const, value: v, placeholder: fake, category: "NAME" };
        });
      return { text, matches };
    };
    return { fn, calls };
  };
  const values = Array.from({ length: PAGES }, (_, i) => `Client${i + 1}`);

  it("fed page by page, ends with EXACTLY the whole-text map, each chunk masked once", async () => {
    const ref = recording(values);
    const expected = await pdfReplacements(whole, ref.fn, { vault: {} });
    const live = recording(values);
    const masker = createChunkMasker(live.fn, { vault: {} });
    for (let n = 1; n <= PAGES; n++) await masker.advance(pages.slice(0, n).join("\n\f\n"));
    expect(masker.done).toBeGreaterThan(0); // work happened WHILE the text was incomplete
    await masker.advance(whole, { final: true });
    expect(masker.result()).toEqual(expected);
    // Same chunks, in the same order: no text masked twice, none skipped.
    expect(live.calls).toEqual(ref.calls);
  });

  it("only masks the chunks a prefix decides, and its covered prefix only grows", async () => {
    const { fn } = recording(values);
    const masker = createChunkMasker(fn);
    await masker.advance(pages.slice(0, 3).join("\n\f\n"));
    const first = masker.partial();
    expect(first.covered).toBeLessThanOrEqual(first.scanned);
    await masker.advance(pages.slice(0, 6).join("\n\f\n"));
    expect(masker.partial().covered).toBeGreaterThanOrEqual(first.covered);
    expect(masker.finished).toBe(false);
  });

  it("refuses a text that does not continue what was masked (the caller then masks it whole)", async () => {
    const { fn } = recording(values);
    const masker = createChunkMasker(fn);
    await masker.advance(pages.slice(0, 8).join("\n\f\n"));
    expect(masker.continues(whole)).toBe(true);
    const other = `X${whole.slice(1)}`;
    expect(masker.continues(other)).toBe(false);
    await expect(masker.advance(other, { final: true })).rejects.toThrow(DIVERGED);
  });

  it("keeps a 1M-character document to a few dozen chunks (each one pays for the vault)", async () => {
    let calls = 0;
    const fn: RedactFn = async (text) => {
      calls++;
      return { text, matches: [] };
    };
    await pdfReplacements("lorem ipsum ".repeat(84_000), fn);
    expect(calls).toBeLessThanOrEqual(40);
  });
});
