import { describe, expect, it } from "vitest";
import { redact } from "../../index";

// The British NINO is WRITTEN in pairs. An English employment contract, a payslip,
// a P45, a P60, and gov.uk itself print « AB 12 34 56 C » — the glued form is
// the exception, not the rule. As long as only the glued form matched, a British
// employee's national identifier left in clear on its most common written form.
function out(text: string): string {
  return redact(text, {}).text;
}
function redacted(text: string, value: string): boolean {
  const o = out(text);
  return !o.includes(value) && /\[REDACTED_NATIONAL_ID_\d+\]/.test(o);
}

describe("UK National Insurance number — les deux écritures", () => {
  it("redacted la forme COLLÉE (inchangé)", () => {
    expect(redacted("National Insurance number AB123456C", "AB123456C")).toBe(true);
  });

  it("redacted la forme ESPACÉE — celle des documents", () => {
    expect(redacted("National Insurance number AB 12 34 56 C", "AB 12 34 56 C")).toBe(true);
    expect(redacted("Her NINO is JT 60 66 05 B and she is paid monthly.", "JT 60 66 05 B")).toBe(true);
  });

  it("redacted les espaces INSÉCABLES qu'une extraction PDF émet verbatim", () => {
    expect(redacted("NI number: AB 12 34 56 C", "AB 12 34 56 C")).toBe(true);
  });

  it("ne franchit AUCUN saut de ligne — sans somme de contrôle, un préfixe rogné passerait", () => {
    // The NINO has no check digit: valid-prefix recovery could not reject a
    // truncated « AB 12\n34 », and fixing the leak would create a false positive. Accepted limitation.
    expect(out("AB 12\n34\n56 C")).toContain("AB 12");
    expect(out("NINO AB 12 34\n56 C fin")).toContain("56 C");
  });

  it("ne mord pas sur une suite de mots ou de groupes ordinaire", () => {
    // Lead letters outside the class (D/F/I/O/Q/U/V) or trailing letter outside A-D.
    expect(out("DF 12 34 56 C")).toContain("DF 12 34 56 C");
    expect(out("AB 12 34 56 Z")).toContain("AB 12 34 56 Z");
    // Wrong-length groups.
    expect(out("AB 123 45 6 C")).toContain("AB 123 45 6 C");
  });
});
