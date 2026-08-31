import { describe, it, expect } from "vitest";
import { pseudonymize } from "./index";
import { scoreCorpus, pct, type BenchCase } from "../bench/metric";
import corpus from "../bench/corpora/juridique.json";

/* Recall bench for COMPLEX LEGAL documents — jugements, statuts, procurations, PV
   d'assemblée, baux commerciaux, conclusions, assignations, cessions de parts,
   contrats de travail, mises en demeure, compromis, ordonnances, transactions,
   pactes d'associés, testaments, requêtes, CGV, plus the DE/ES/IT contract forms.
   These are the densest identifying layouts the product meets: a party block names
   a person, their birth, their address and their company's registry number in four
   consecutive lines, and a single miss re-identifies the rest.

   Scores the WHOLE deterministic pipeline as it ships (`pseudonymize`, no model),
   like `administratif` / `layouts`. */

const cases = corpus as BenchCase[];

const detect = async (text: string): Promise<string[]> => {
  const vault: Record<string, string> = {};
  await pseudonymize(text, { vault });
  return Object.values(vault);
};

describe("complex-legal recall (full deterministic pipeline)", () => {
  it("holds the recall floor on the juridique corpus", async () => {
    const s = await scoreCorpus(cases, detect);
    // eslint-disable-next-line no-console
    console.log(
      `[juridique] overall ${s.found}/${s.total} (${pct(s.found, s.total)}%) FP ${s.fp}\n` +
        `  misses: ${s.misses.join(", ") || "none"}`,
    );
    expect(pct(s.found, s.total)).toBeGreaterThanOrEqual(97);
  }, 30_000);
});
