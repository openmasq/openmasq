// The property that matters for a digit fake: whoever holds ONLY the fake must not be
// able to compute the real value. `salt.test.ts` pins determinism and salt-sensitivity —
// neither of which says anything about invertibility, and both of which an additive
// cipher satisfies happily.
//
// The regression this file exists for: `fakeDigits` used to emit
// `(h + 7i + n + 3) % 10`, where `n` is the REAL digit. Every unknown except `h mod 10`
// cancels, so the holder of a fake recovers TEN candidate plaintexts — and the value's
// own structure (Luhn for a card, the published bank code inside an IBAN, an operator
// prefix inside a phone number) picks the true one. The conversation salt did not help:
// being ADDED, it is absorbed into `h mod 10`.
//
// So the assertions below are stated over the whole family that break was a member of:
// the fake must not be an AFFINE function of the real digits, for any shift and any
// per-position step. A future "small simplification" that folds the real digit back in
// fails here rather than in someone's transcript.
import { describe, it, expect } from "vitest";
import { fakeDigits } from "./primitives";
import { fakeIp } from "./entities";

const digitsOf = (s: string) => s.replace(/\D/g, "").split("").map(Number);

/**
 * Is `fake` explained by `real_i + a*i + c (mod 10)` for some (a, c)? That covers the
 * additive cipher (a=7, c=h+3) and every other affine variant of it.
 */
function affineRelationExists(real: string, fake: string): boolean {
  const r = digitsOf(real);
  const f = digitsOf(fake);
  if (r.length !== f.length || r.length === 0) return false;
  for (let a = 0; a < 10; a++)
    for (let c = 0; c < 10; c++)
      if (r.every((n, i) => (n + a * i + c) % 10 === f[i])) return true;
  return false;
}

/** The attack, written out: recover candidates from the fake alone. */
function recoverCandidates(fake: string): string[] {
  const out: string[] = [];
  for (let a = 0; a < 10; a++)
    for (let c = 0; c < 10; c++) {
      let i = 0;
      out.push(fake.replace(/\d/g, (d) => String((((Number(d) - a * i++ - c) % 10) + 10) % 10)));
    }
  return out;
}

const VALUES = [
  "+33 6 12 34 56 78", // phone — operator prefix would pick the candidate
  "FR7630006000011234567890189", // IBAN — the bank code is public
  "4539148803436467", // card — Luhn picks the candidate
  "863 471 587 00015", // SIRET-shaped, spaced
  "1 84 12 75 116 001 42", // national id shaped
];

describe("fakeDigits is not invertible from the fake alone", () => {
  const salt = 0x2f6b91c4;

  for (const real of VALUES) {
    it(`no affine relation leaks the real digits of ${real}`, () => {
      const fake = fakeDigits(real, salt);
      expect(affineRelationExists(real, fake)).toBe(false);
    });

    it(`the ten-candidate recovery does not find ${real}`, () => {
      const fake = fakeDigits(real, salt);
      expect(recoverCandidates(fake)).not.toContain(real);
    });
  }

  it("stays deterministic for one value + salt (identity atomicity)", () => {
    expect(fakeDigits(VALUES[0], salt)).toBe(fakeDigits(VALUES[0], salt));
  });

  it("still shifts with the conversation salt", () => {
    expect(fakeDigits(VALUES[0], salt)).not.toBe(fakeDigits(VALUES[0], salt + 1));
  });

  it("keeps the layout (separators and digit count)", () => {
    const fake = fakeDigits(VALUES[3], salt);
    expect(fake).toMatch(/^\d{3} \d{3} \d{3} \d{5}$/);
  });

  it("does not mirror one spelling's grouping onto another", () => {
    // Same number, two groupings — the DIGITS must match (the vault key is separator
    // insensitive); only the layout differs.
    const a = fakeDigits("863 471 587 00015", salt).replace(/\D/g, "");
    const b = fakeDigits("863471587 000 15", salt).replace(/\D/g, "");
    expect(a).toBe(b);
  });
});

describe("fakeIp does not fold the real octet into the fake", () => {
  const salt = 0x7c1a55e0;

  it("no affine relation leaks the real octets", () => {
    const real = "192.168.14.203";
    expect(affineRelationExists(real, fakeIp(real, salt))).toBe(false);
  });

  it("emits in-range octets", () => {
    for (const real of ["10.0.0.1", "192.168.14.203", "8.8.8.8"]) {
      const fake = fakeIp(real, salt);
      for (const oct of fake.split(".")) expect(Number(oct)).toBeLessThanOrEqual(255);
      expect(fake).not.toBe(real);
    }
  });
});
