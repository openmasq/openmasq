import { describe, expect, it } from "vitest";
import { REDACTION_CATEGORIES } from "./index";
import { ALWAYS_ON, categoriesForLevel, disabledKindsOf, FROM_RENFORCE, usesLocalModel } from "./levels";

describe("the three levels as category sets", () => {
  /**
   * ⚠️ `standard` is the tier a coding agent lives in — pattern rules, no model — and the
   * default of the local proxy. A shape-only detector there pays for itself in false
   * positives on source code: the `@` handle rule turned `@file`, `@handle` and a bot mention
   * into "pseudonyms", 28 of 42 substitutions on one run that read three `CLAUDE.md`.
   */
  it("keeps the shape-only detectors off at standard, on from renforce", () => {
    const standard = categoriesForLevel("standard");
    const renforce = categoriesForLevel("renforce");
    for (const key of FROM_RENFORCE) {
      expect(standard[key], key).toBe(false);
      expect(renforce[key], key).toBe(true);
    }
    expect(disabledKindsOf(standard)).toContain("username");
    expect(disabledKindsOf(renforce)).not.toContain("username");
  });

  it("leaves the model's categories to renforce and strict, and needs no model at standard", () => {
    const standard = categoriesForLevel("standard");
    expect(standard.name).toBe(false);
    expect(standard.company).toBe(false);
    expect(usesLocalModel(standard)).toBe(false);
    expect(categoriesForLevel("renforce").name).toBe(true);
    expect(usesLocalModel(categoriesForLevel("renforce"))).toBe(true);
  });

  it("turns everything on at strict, and never turns the floor off", () => {
    const strict = categoriesForLevel("strict");
    for (const c of REDACTION_CATEGORIES) expect(strict[c.key], c.key).toBe(true);
    for (const level of ["standard", "renforce", "strict"] as const)
      for (const key of ALWAYS_ON) expect(categoriesForLevel(level)[key], `${level} ${key}`).toBe(true);
  });

  /** The anchored PII stays on at every level: an e-mail or an IBAN in clear at `standard`
   *  would make the default tier a leak, not a lighter touch. */
  it("keeps the anchored PII on at standard", () => {
    const standard = categoriesForLevel("standard");
    for (const key of ["email", "phone", "iban", "card", "ip", "secret"] as const)
      expect(standard[key], key).toBe(true);
  });
});
