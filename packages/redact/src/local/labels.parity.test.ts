import { describe, expect, it } from "vitest";
import { CATEGORY_SECTION } from "../highlight/sections";
import { redactionCategory } from "../kinds";
import { nerLabelToCategory, TRAINED_LABELS } from "./labels";

/**
 * The seam between this product and the private `openmasq-model` repository. They cannot
 * import each other, so the contract is: the trainer's `MODEL_LABELS` is a subset of
 * `TRAINED_LABELS`, and every one of those resolves to a category the product actually has.
 *
 * Why this test exists: the mapper knew only CoNLL (PER/ORG/LOC), which is all the SHIPPED
 * model emits. A model retrained on the product's own vocabulary would have had seven of
 * its nine labels dropped here — no error, no warning, the spans simply gone.
 */
describe("the labels a retrained model may emit", () => {
  // ⚠️ `CATEGORY_SECTION` and NOT `@openmasq/catalog`: the dependency runs catalog -> redact,
  // so importing the catalogue from here is backwards and breaks this package's typecheck.
  // It is also the stronger check — the record is `Record<RedactionCategory, …>`, so
  // TypeScript itself keeps it exhaustive over every category that exists.
  const real = new Set(Object.keys(CATEGORY_SECTION));

  it("each resolve to a category this product has a switch for", () => {
    for (const label of TRAINED_LABELS) {
      const mapped = nerLabelToCategory(label);
      expect(mapped, `${label} is dropped by the mapper`).not.toBe("");
      expect(real, `${label} -> ${mapped}, which is not a product category`).toContain(
        redactionCategory(mapped) as string,
      );
    }
  });

  it("survive the BIO prefixes a token classifier emits", () => {
    for (const label of TRAINED_LABELS) {
      expect(nerLabelToCategory(`B-${label}`)).toBe(nerLabelToCategory(label));
      expect(nerLabelToCategory(`I-${label.toLowerCase()}`)).toBe(nerLabelToCategory(label));
    }
  });

  it("still map CoNLL, which is what the model in the box emits today", () => {
    expect(nerLabelToCategory("PER")).toBe("NAME");
    expect(nerLabelToCategory("B-ORG")).toBe("ORG");
    expect(nerLabelToCategory("LOC")).toBe("CITY");
  });

  it("send every credential family to the real secret category, not the loose heuristic", () => {
    // `apikey` is the catalogue's own broad guess ("toute chaîne qui RESSEMBLE à une clé").
    // Switching it off must not stop a session cookie or a private key from being masked.
    for (const label of ["SECRET", "COOKIE", "APIKEY", "JWT", "PRIVKEY", "CONNSTR"]) {
      // ⚠️ Assert the MAPPING first. `redactionCategory("")` is itself "secret" — its
      // fall-through — so checking only the category passes just as happily when the label
      // was dropped entirely. That is the exact silent failure this file exists to catch,
      // and it caught this test being written the lazy way.
      expect(nerLabelToCategory(label), `${label} is dropped by the mapper`).not.toBe("");
      expect(redactionCategory(nerLabelToCategory(label)), label).toBe("secret");
    }
  });

  it("drop what is deliberately unmapped, rather than guessing", () => {
    for (const label of ["MISC", "DATE", "TIME", "O", "NATIONALITY"]) {
      expect(nerLabelToCategory(label)).toBe("");
    }
  });
});
