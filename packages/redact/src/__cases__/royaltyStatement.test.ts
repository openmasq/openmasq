import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pseudonymize } from "../index";

/* Regression suite for the royalties-statement (relevé de répartition) leak: a
   two-column PDF extraction whose company header and member block shipped several
   identifiers in CLEAR. The fixture reproduces the exact layout traps:
   - "631 825 941 RCS Mulhouse" — number BEFORE the RCS keyword;
   - OCR'd digits: the SIREN/SIRET/TVA all FAIL their checksum on purpose (a real
     misread must still be redacted — keyword + structure carry the precision);
   - "N° TVA intracommunautaire :" — a full word between keyword and value;
   - "N° compte : 317645928   ␣␣␣   5 rue des Bruyères" — a labeled number and the
     right column's address on the SAME extracted line (column-gap glue);
   - "148 avenue de la Grande Armée - 93360 NEUILLY-PLAISANCE CEDEX" — a street
     long enough that the address span used to be cut MID-WORD and never applied. */

const text = readFileSync(
  fileURLToPath(new URL("../__fixtures__/royalty-statement.txt", import.meta.url)),
  "utf8",
);

describe("relevé de répartition (two-column statement) — nothing identifying survives", () => {
  it("redacted every identifier the layout used to leak", async () => {
    const vault: Record<string, string> = {};
    const out = await pseudonymize(text, { vault });
    const mustNotSurvive = [
      "631 825 941", // SIREN (Luhn-INVALID = OCR'd), both orders: before RCS + after SIRET
      "22 761", // the SIRET's NIC tail — a checksum failure must not leak the suffix
      "FR 16 631 825 941", // TVA intracommunautaire, key + SIREN both checksum-invalid
      "148 avenue de la Grande Armée",
      "93360 NEUILLY-PLAISANCE",
      "5 rue des Bruyères",
      "66000 PERPIGNAN",
      "5837219", // N° de personne
      "317645928", // N° compte
      "082073215194366", // N° sécurité sociale (invalid NIR shape → caught by its label)
      "Léo Verchère",
      "LÉO VERCHÈRE",
      "+52(6)7 33 48 11 26",
    ];
    for (const v of mustNotSurvive) expect(out.text).not.toContain(v);
  });

  it("every vault original is fully substituted and column-gap free", async () => {
    const vault: Record<string, string> = {};
    const out = await pseudonymize(text, { vault });
    for (const original of Object.values(vault)) {
      // A vault entry whose value still occurs verbatim is a MINTED-BUT-UNAPPLIED
      // fake (the mid-word-truncated address failure mode): recorded, yet leaked.
      expect(out.text).not.toContain(original);
      // A value that crosses the two-column whitespace gap glued two unrelated
      // fields together (the "317645928␣…␣5" account-number failure mode).
      expect(original).not.toMatch(/\s{2}/);
    }
  });

  it("does not over-redact the statement's amounts, rates and dates", async () => {
    const out = await pseudonymize(text, { vault: {} });
    for (const v of ["95,72", "112,91", "6,94", "98.25%", "6 juillet 2026", "RÉPARTITION DE DROITS D'AUTEUR"]) {
      expect(out.text).toContain(v);
    }
  });
});
