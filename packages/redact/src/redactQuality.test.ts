import { describe, it, expect } from "vitest";
import { createNerPredict, type NerPipeline } from "./local/ner";
import { detectLocalNer } from "./local/detect";
import { replaceStandalone, hasStandalone } from "./util";
import { isStructuredId, isWordNumberGlue } from "./engine/validators";

// Regression suite for the payslip-PDF redaction quality bug: a table-heavy PDF
// whose extraction glues cells together made the local NER + the api_token rule
// emit garbage, and the VISIBLE render corrupted real words.

/** A pipeline that reports every listed word (whatever its shape) as a PER entity —
 *  simulates the noisy NER on garbled table text. */
function pipe(words: string[]): NerPipeline {
  return (text: string) =>
    words.filter((w) => text.includes(w)).map((w) => ({ entity_group: "PER", word: w, score: 0.99 }));
}

describe("local NER — drop non-entity noise from table extraction", () => {
  it("drops 2-char fragments and digit-glued tokens; keeps a real name", async () => {
    const predict = await createNerPredict({ pipeline: pipe(["IE", "PA", "De", "mensuelle160", "Sabourdin"]) });
    const found = await detectLocalNer("BULLETIN DE PAIE mensuelle160 Sabourdin", predict);
    const values = found.map((f) => f.value);
    expect(values).toContain("Sabourdin"); // a real name survives
    expect(values).not.toContain("IE");
    expect(values).not.toContain("PA");
    expect(values).not.toContain("De");
    expect(values).not.toContain("mensuelle160"); // digit-glue rejected
  });
});

describe("word+number glue is not a secret (api_token FP)", () => {
  it("isWordNumberGlue matches label↔number extraction glue", () => {
    for (const s of ["COEFFICIENT2", "mensuelle160", "public86", "Famille4", "SALARIALES4", "restaurant20"]) {
      expect(isWordNumberGlue(s)).toBe(true);
    }
  });
  it("does NOT match a real token / interleaved alnum", () => {
    expect(isWordNumberGlue("sk4eC7abZ9")).toBe(false); // interleaved
    expect(isWordNumberGlue("AB12")).toBe(false); // letter part too short / no vowel
    expect(isWordNumberGlue("Sabourdin")).toBe(false); // no digits
  });
  it("isStructuredId spares glue (bare + separated) so the api_token rule won't fire", () => {
    expect(isStructuredId("COEFFICIENT2")).toBe(true); // bare word+digits → spared
    expect(isStructuredId("Titres-restaurant20")).toBe(true); // separated, glue segment
    expect(isStructuredId("sk_live_4eC7abZ9kLmNoPqR")).toBe(false); // a real key still redacts
  });
});

describe("boundary-safe visible replacement (no word corruption)", () => {
  it("replaces standalone occurrences only", () => {
    expect(replaceStandalone("BULLETIN DE PAIE", "PA", "Rouen")).toBe("BULLETIN DE PAIE"); // glued → untouched
    expect(replaceStandalone("INGÉNIEURS", "IE", "De")).toBe("INGÉNIEURS"); // glued → untouched
    expect(replaceStandalone("Ville: STRASBOURG", "STRASBOURG", "MORDELLES")).toBe("Ville: MORDELLES");
  });
  it("hasStandalone reflects whether a value occurs unglued", () => {
    expect(hasStandalone("INGÉNIEURS", "IE")).toBe(false);
    expect(hasStandalone("code IE fin", "IE")).toBe(true);
  });
});
