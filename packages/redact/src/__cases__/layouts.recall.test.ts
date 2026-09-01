import { describe, it, expect } from "vitest";
import { pseudonymize } from "../index";
import { scoreCorpus, pct, type BenchCase } from "../../bench/metric";
import corpus from "../../bench/corpora/layouts.json";

/* Recall bench for COMPLEX-LAYOUT document excerpts — the shapes a real upload takes
   after PDF/OCR extraction: two-column payslips fused by extraction, bank-statement
   tables with a mid-value line wrap, Kbis/invoice registres, letter-spaced OCR digits,
   glued OCR words, dotted leaders, vertical label/value forms, header-annotated CSV
   rows, notarial "VILLE (CP)" order, signature blocks. Scores the WHOLE deterministic
   pipeline as it ships (`pseudonymize`, no model), like `administratif.recall.test.ts`
   — a drop below the floor means a layout family regressed. */

const cases = corpus as BenchCase[];

const detect = async (text: string): Promise<string[]> => {
  const vault: Record<string, string> = {};
  await pseudonymize(text, { vault });
  return Object.values(vault);
};

describe("complex-layout recall (full deterministic pipeline)", () => {
  it("holds the recall floor on the layouts corpus", async () => {
    const s = await scoreCorpus(cases, detect);
    // eslint-disable-next-line no-console
    console.log(
      `[layouts] overall ${s.found}/${s.total} (${pct(s.found, s.total)}%) FP ${s.fp}\n` +
        `  misses: ${s.misses.join(", ") || "none"}`,
    );
    expect(pct(s.found, s.total)).toBeGreaterThanOrEqual(98);
  }, 30_000);
});
