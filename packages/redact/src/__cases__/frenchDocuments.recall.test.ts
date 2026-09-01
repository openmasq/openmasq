import { describe, it, expect } from "vitest";
import { pseudonymize } from "../index";
import { scoreCorpus, pct, type BenchCase } from "../../bench/metric";
import corpus from "../../bench/corpora/frenchDocuments.json";

/* Recall bench for REAL-WORLD FRENCH DOCUMENTS — each case is a SYNTHETIC replica of a
   real document from a private 15-document corpus (CNI scan, quittance, facture,
   attestation d'énergie, avenant OCR-abîmé, bulletin de paie, diagnostic, promesse
   notariale, appel de fonds, PV d'AG, adhésion assurance, accord de crédit, passeport
   MRZ): same layouts, same label idioms, same OCR damage — invented people and
   checksum-valid numbers reused from already-committed corpora. The private originals
   stay OUT of the repo; this is their committable shadow, so the recall they measured
   is pinned in CI. Scores the WHOLE deterministic pipeline as it ships (pseudonymize,
   no model), like `administratif.recall.test.ts`. */

const cases = corpus as BenchCase[];

const detect = async (text: string): Promise<string[]> => {
  const vault: Record<string, string> = {};
  await pseudonymize(text, { vault });
  return Object.values(vault);
};

describe("real-world document recall (full deterministic pipeline)", () => {
  it("holds the recall floor on the documentsFr corpus", async () => {
    const s = await scoreCorpus(cases, detect);
    // eslint-disable-next-line no-console
    console.log(
      `[documentsFr] overall ${s.found}/${s.total} (${pct(s.found, s.total)}%) FP ${s.fp}\n` +
        `  misses: ${s.misses.join(", ") || "none"}`,
    );
    // Floor measured at authoring time — a drop means a document layout regressed.
    expect(pct(s.found, s.total)).toBeGreaterThanOrEqual(93);
  }, 30_000);
});
