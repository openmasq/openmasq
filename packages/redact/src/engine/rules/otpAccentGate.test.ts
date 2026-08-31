import { describe, it, expect } from "vitest";
import { redact } from "../../index";

/**
 * ⚠️ REGRESSION — « Code de sécurité : 482913 » was NEVER redacted.
 *
 * The rule did list this label. The bug was its FINAL `\b`: in JS, `\b` is
 * ASCII-only, so an alternative that can end on an accented letter
 * (`s[ée]curit[ée]`) never finds its boundary and the gate never fires.
 * « Code de vérification » (which ends in `n`) worked — hence an invisible hole on the
 * accented variant alone. This is exactly the trap `gate()` documents and avoids;
 * this rule had not applied it.
 *
 * Stakes: an OTP / 2FA code behind its most common French label.
 */
const caught = (t: string): boolean => redact(t).matches.some((m) => m.type === "secret");

describe("code de sécurité — la garde ne doit pas buter sur l'accent final", () => {
  it.each([
    "Code de sécurité : 482913",
    "Code de securite : 482913", // unaccented spelling (degraded export)
    "Codes de sécurité 482913",
  ])("redacted « %s »", (t) => expect(caught(t)).toBe(true));

  it.each([
    "Code de vérification : 482913", // already worked — must not break
    "Code de confirmation : 482913",
    "Code pin : 482913",
    "otp : 482913",
  ])("n'a rien cassé sur « %s »", (t) => expect(caught(t)).toBe(true));
});

describe("la garde reste étroite", () => {
  it.each([
    "La sécurité 2024 est un enjeu.", // not a code
    "code de sécurité renforcé", // no numeric value
    "sécurité 12", // too short (< 4 digits)
  ])("laisse « %s » en clair", (t) => expect(caught(t)).toBe(false));

  it("⚠️ une COPULE entre l'étiquette et la valeur reste un trou connu", () => {
    // « Le code de sécurité EST 482913 »: the separator excludes letters, by
    // construction. Same class as « Mdp wifi : … ». Documented, not fixed here —
    // widening the separator to words is the lever that manufactures false positives.
    expect(caught("Le code de sécurité est 482913")).toBe(false);
  });
});
