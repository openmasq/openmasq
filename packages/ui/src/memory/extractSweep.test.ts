import { describe, it, expect, vi } from "vitest";
import { sweepExtraction } from "./extractSweep";
import type { Extraction, ExtractedFact } from "./extractParse";

const fact = (entity: string): ExtractedFact => ({
  entity,
  cat: "organisation",
  fact: `Fait sur ${entity}`,
});
const page = (names: string[], profile?: string): Extraction => ({
  facts: names.map(fact),
  ...(profile ? { profile } : {}),
});

describe("sweepExtraction — finish what one call started", () => {
  it("asks again while a pass FILLS its ceiling, excluding what it already captured", async () => {
    // The measured case: a 20-row table against a ceiling of 6.
    const pages = [page(["A", "B", "C"]), page(["D", "E", "F"]), page(["G"])];
    const seen: string[][] = [];
    const runPass = vi.fn(async (exclude: string[]) => {
      seen.push(exclude);
      return pages[seen.length - 1] ?? null;
    });
    const out = await sweepExtraction(runPass, { limit: 3 });
    expect(out.facts.map((f) => f.entity)).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    expect(out.passes).toBe(3);
    expect(out.truncated).toBe(false);
    // Pass 2 was told about pass 1's capture, pass 3 about both.
    expect(seen[1]).toEqual(["A", "B", "C"]);
    expect(seen[2]).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("stops at the FIRST short pass — a partial page means nothing is left", async () => {
    const runPass = vi.fn(async () => page(["A", "B"]));
    const out = await sweepExtraction(runPass, { limit: 6 });
    expect(runPass).toHaveBeenCalledTimes(1);
    expect(out.facts).toHaveLength(2);
  });

  it("stops when a FULL pass brings nothing new (the model is repeating itself)", async () => {
    const runPass = vi.fn(async () => page(["A", "B", "C"]));
    const out = await sweepExtraction(runPass, { limit: 3 });
    expect(runPass).toHaveBeenCalledTimes(2); // one real, one that only repeated
    expect(out.facts.map((f) => f.entity)).toEqual(["A", "B", "C"]);
    expect(out.truncated).toBe(false);
  });

  it("never exceeds maxPasses, and SAYS when it stopped while still full", async () => {
    let n = 0;
    const runPass = vi.fn(async () => page([`E${++n}a`, `E${n}b`, `E${n}c`]));
    const out = await sweepExtraction(runPass, { limit: 3, maxPasses: 2 });
    expect(runPass).toHaveBeenCalledTimes(2);
    expect(out.facts).toHaveLength(6);
    expect(out.truncated).toBe(true); // the caller can be honest about the remainder
  });

  it("excludes what memory ALREADY holds, from the very first pass", async () => {
    const seen: string[][] = [];
    const runPass = async (exclude: string[]) => {
      seen.push(exclude);
      return page(["Walmart", "Apple"]);
    };
    const out = await sweepExtraction(runPass, { limit: 6, known: ["Apple"] });
    expect(seen[0]).toEqual(["Apple"]);
    // …and drops it again if the model emits it anyway.
    expect(out.facts.map((f) => f.entity)).toEqual(["Walmart"]);
  });

  it("dedups across passes case- and spacing-insensitively", async () => {
    const pages = [page(["Karl Studio", "Orvalis"]), page(["karl  studio", "Zorvia"])];
    let i = 0;
    const out = await sweepExtraction(async () => pages[i++] ?? null, { limit: 2 });
    expect(out.facts.map((f) => f.entity)).toEqual(["Karl Studio", "Orvalis", "Zorvia"]);
  });

  it("keeps the FIRST profile offered, and survives a failed pass mid-sweep", async () => {
    const pages: (Extraction | null)[] = [page(["A", "B"], "Directeur artistique"), null];
    let i = 0;
    const out = await sweepExtraction(async () => pages[i++] ?? null, { limit: 2 });
    expect(out.profile).toBe("Directeur artistique");
    expect(out.facts).toHaveLength(2); // a partial sweep is still worth keeping
  });

  it("a first pass that fails yields nothing, without throwing", async () => {
    const out = await sweepExtraction(async () => null, { limit: 6 });
    expect(out).toMatchObject({ facts: [], passes: 1, truncated: false });
  });
});
