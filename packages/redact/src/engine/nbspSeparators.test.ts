import { describe, it, expect } from "vitest";
import { redact } from "../index";

/**
 * The NO-BREAK space separators, across EVERY rule that groups a value.
 *
 * U+00A0 (no-break) and U+202F (narrow no-break) are the standard French typographic
 * digit-group separators, and PDF/text extraction emits them verbatim — the exact path a
 * scanned document takes through this engine. A rule whose separator class is a plain
 * `[ ]` therefore ships the whole value in CLEAR, which is the worst failure this engine
 * can have. `rules.international.util.ts` `SP` exists for it and card/IBAN/NIR/SIRET/VAT
 * were fixed long ago; an audit found the two PHONE rules and the BIP-39 mnemonic still
 * on a plain space class.
 *
 * This test is deliberately a MATRIX over separators rather than one case per rule: the
 * hole was never in the shape, always in the separator, and a new grouped rule should be
 * added here so the same omission can't reappear.
 */
const NBSP = " ";
const NNBSP = " ";
const SEPARATORS: Array<[string, string]> = [
  ["espace U+0020", " "],
  ["no-break U+00A0", NBSP],
  ["narrow no-break U+202F", NNBSP],
];

/** A seed phrase must be 12–24 words FROM the BIP-39 list (the validator checks it). */
const MNEMONIC =
  "abandon ability able about above absent absorb abstract absurd abuse access accident";

const detected = (text: string): string[] =>
  redact(text, { vault: {} }).matches.map((m) => m.category ?? m.type);

describe("grouped values survive a NO-BREAK space separator (audit F1)", () => {
  for (const [label, sep] of SEPARATORS) {
    const re = (s: string) => s.replace(/ /g, sep);

    it(`téléphone FR national — ${label}`, () => {
      expect(detected(`Appelle au ${re("06 12 34 56 78")} demain`)).toContain("phone");
    });

    it(`téléphone international — ${label}`, () => {
      // BOTH prefixes: `0033…` was the form the plain-space class missed while `+33…`
      // happened to survive, so pinning only one would have kept the hole open.
      expect(detected(`Mon numéro : ${re("+33 6 12 34 56 78")}`)).toContain("phone");
      expect(detected(`Mon numéro : ${re("0033 6 12 34 56 78")}`)).toContain("phone");
    });

    it(`phrase de récupération BIP-39 — ${label}`, () => {
      // Rule `type` is "crypto" (it resolves to the "secret" CATEGORY downstream); the
      // regex layer reports the type, which is what this matrix reads.
      expect(detected(re(MNEMONIC))).toContain("crypto");
    });

    it(`carte bancaire — ${label} (déjà couvert, gardé en régression)`, () => {
      expect(detected(`CB ${re("4716 6337 1042 9833")}`)).toContain("card");
    });

    it(`NIR — ${label} (déjà couvert, gardé en régression)`, () => {
      expect(detected(`n° ${re("1 65 03 18 742 596 90")}`)).toContain("national_id");
    });
  }
});
