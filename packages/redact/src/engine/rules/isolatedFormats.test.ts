import { describe, it, expect } from "vitest";
import { redact } from "../../index";

/**
 * ⚠️ REGRESSION — three isolated formats used to go out in clear (benchmark v1.0).
 *
 * Each one is a too-narrow regex BOUNDARY, not a detection limit: the family
 * was already covered, only one writing dialect fell outside it.
 */

const kinds = (text: string): string[] => redact(text).matches.map((m) => m.type);
const value = (text: string, type: string): string | undefined =>
  redact(text).matches.find((m) => m.type === type)?.value;

describe("téléphone international écrit avec des parenthèses", () => {
  /**
   * ⚠️ CHARACTERIZATION, not a fix — and the lesson is worth keeping.
   *
   * The ticket flagged the form `+1 (555) 123-4567` as half-redacted. The `phone`
   * regex in `RULES` indeed doesn't match parentheses, and widening it seemed
   * therefore to be the fix. Measured on the PIPELINE, it was a no-op: `phones.ts`
   * `detectPhones` (libphonenumber) already covers all these forms. Benchmarking an
   * isolated rule answers a question nobody is asking; the unit that matters is the
   * pipeline. These cases stay here so coverage doesn't slip by accident.
   */
  it.each([
    "+1 (212) 736-5000",
    "+44 (20) 7123 4567",
    "+33 (0)6 12 34 56 78",
  ])("redacted « %s » en entier", (text) => {
    expect(value(text, "phone")).toBe(text);
  });

  it("n'a pas cassé la forme sans parenthèses", () => {
    expect(kinds("+33 6 12 34 56 78")).toContain("phone");
  });

  /**
   * ⚠️ This case comes from the ticket and it is NOT a bug: `555-123-4567` is a
   * FICTIONAL number (the 555 area code is reserved for fiction precisely so it belongs to
   * nobody). `isValidIntlPhone` rejects it, and that's the validator doing its job
   * — it's also what makes widening the regex safe: an overly greedy match
   * fails validation instead of creating a false positive.
   */
  it("laisse un numéro que libphonenumber juge invalide", () => {
    expect(kinds("+1 (555) 123-4567")).not.toContain("phone");
  });
});

describe("chemin réseau Windows (UNC)", () => {
  it("redacted \\\\srv-fichiers\\compta\\2026", () => {
    const text = "Partage : \\\\srv-fichiers\\compta\\2026";
    expect(value(text, "path")).toBe("\\\\srv-fichiers\\compta\\2026");
  });

  it("n'a pas cassé le chemin à lettre de lecteur", () => {
    expect(kinds("C:\\Users\\julien\\rapport.docx")).toContain("path");
  });
});

describe("e-mail obfusqué", () => {
  /** Written this way to dodge a scraper: the address is therefore REAL and its
   *  owner expects to be reached at it. The simple rule saw no `@` in it. */
  it.each([
    ["Joins augustin [at] kelm.io", "augustin [at] kelm.io"],
    ["Joins augustin (at) kelm.io", "augustin (at) kelm.io"],
    ["Joins augustin [at] kelm [dot] io", "augustin [at] kelm [dot] io"],
  ])("redacted « %s »", (text, expected) => {
    expect(value(text, "email")).toBe(expected);
  });

  it("exige le CROCHET — de la prose ordinaire ne matche pas", () => {
    // Without this constraint, « regarde at home » and « le chat est au chaud » would be
    // read as addresses. That's what bounds the rule.
    expect(kinds("regarde at home")).not.toContain("email");
    expect(kinds("Le chat est au chaud")).not.toContain("email");
  });

  it("n'a pas cassé l'adresse normale", () => {
    expect(value("Écris à marie@exemple.fr", "email")).toBe("marie@exemple.fr");
  });
});

/**
 * The ticket also claimed "only the JWT's first segment is taken". Not reproducible:
 * the `jwt` rule already takes the whole token. Pinned so the next campaign doesn't
 * re-flag a case that works.
 */
describe("JWT — déjà couvert en entier", () => {
  it("redacted les trois segments", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(value(`Bearer : ${jwt}`, "jwt")).toBe(jwt);
  });
});
