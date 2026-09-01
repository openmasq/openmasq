import { describe, it, expect } from "vitest";
import { pseudonymize } from "../index";
import { scoreCorpus, pct, type BenchCase } from "../../bench/metric";
import corpus from "../../bench/corpora/administrative.json";

/* Recall bench for FRENCH ADMINISTRATIVE documents (relevés, actes notariés,
   liasses, courriers d'organismes, formulaires OCR) — the layouts that defeated
   the engine one by one: two-column extraction, "VILLE (CP)" order, letter-spaced
   digits, dotted leaders, glued OCR, checksum-broken ids, header pairs. Unlike
   `engine/addresses.recall.test.ts` (one detector family), this scores the WHOLE
   deterministic pipeline exactly as it ships: `pseudonymize` with no model — the
   detected values are the vault ORIGINALS. Runs in `pnpm test` (pure, fast) and
   floors the family's recall in CI. */

const cases = corpus as BenchCase[];

const detect = async (text: string): Promise<string[]> => {
  const vault: Record<string, string> = {};
  await pseudonymize(text, { vault });
  return Object.values(vault);
};

describe("administrative-document recall (full deterministic pipeline)", () => {
  it("holds the recall floor on the administratif corpus", async () => {
    const s = await scoreCorpus(cases, detect);
    // eslint-disable-next-line no-console
    console.log(
      `[administratif] overall ${s.found}/${s.total} (${pct(s.found, s.total)}%) FP ${s.fp}\n` +
        `  misses: ${s.misses.join(", ") || "none"}`,
    );
    // Floor (measured at authoring time): a drop below means an administrative
    // layout regressed — these are the exact shapes users feed the product.
    expect(pct(s.found, s.total)).toBeGreaterThanOrEqual(97);
  }, 30_000);
});
