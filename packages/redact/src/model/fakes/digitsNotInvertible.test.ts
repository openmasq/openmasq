// The property that matters for a fake: whoever holds ONLY the fake must not be able to
// compute the real value. `salt.test.ts` pins determinism and salt-sensitivity — neither
// says anything about invertibility, and both are satisfied by an additive cipher.
//
// The regression this file exists for: a generator that emits `(h + 7i + n + 3) % 10`,
// where `n` is the REAL character. Every unknown except `h mod 10` cancels, so the holder
// of a fake recovers TEN candidate plaintexts — and the value's own structure picks the
// true one: Luhn for a card, the embedded RIB key for a French IBAN, the operator prefix
// for a phone. For an MRZ the letters carry the NAME, so ~130 candidates contain exactly
// one pronounceable surname.
//
// ⚠️ Two things this oracle must do that the obvious version does not:
//
//  1. **Cover every generator that re-derives from the value**, not just `fakeDigits`.
//     `fakePhone`, `fakeIban`, `fakeMrz` and the checksummed schemes each carry their own
//     copy of the loop — a first pass at this file tested two of them and the other three
//     stayed broken behind a green suite.
//  2. **Fit PIECEWISE, not globally.** `fakePhone` keeps a country/class prefix verbatim
//     and restarts its counter after it; `fakeIban` recomputes two check digits from the
//     fake body. Neither is affine over the WHOLE string, so a single global fit reports
//     "no relation" on a generator that is trivially invertible position by position.
//     So: every contiguous run of ≥4 positions is fitted separately.
import { describe, it, expect } from "vitest";
import { fakeFor } from "./dispatch";
import { fakeDigits } from "./primitives";
import { fakeIp } from "./entities";
import { keyFromHex } from "./prf";

const KEY = keyFromHex("c3".repeat(32))!;
const MIN_RUN = 4;

const digits = (s: string) => s.replace(/\D/g, "").split("").map(Number);
const alnum = (s: string) => s.replace(/[^A-Z0-9]/g, "").split("");

/**
 * Is any contiguous run of ≥`MIN_RUN` positions explained by `real + a*i + c (mod m)`?
 * That covers the additive cipher and every affine variant of it, including one that
 * only holds over a suffix.
 */
function piecewiseAffine(real: number[], fake: number[], m: number): boolean {
  if (real.length !== fake.length) return false;
  for (let start = 0; start + MIN_RUN <= real.length; start++) {
    for (let end = start + MIN_RUN; end <= real.length; end++) {
      for (let a = 0; a < m; a++)
        for (let c = 0; c < m; c++) {
          let ok = true;
          for (let i = start; i < end && ok; i++)
            if ((real[i] + a * (i - start) + c) % m !== fake[i]) ok = false;
          if (ok) return true;
        }
    }
  }
  return false;
}

/** The same test over an alphanumeric string (MRZ): digits mod 10, letters mod 26. */
function mrzAffine(real: string[], fake: string[]): boolean {
  const asNum = (cs: string[], pick: (c: string) => boolean, base: number) =>
    cs.filter(pick).map((c) => (base === 10 ? Number(c) : c.charCodeAt(0) - 65));
  const isDigit = (c: string) => /\d/.test(c);
  const isAlpha = (c: string) => /[A-Z]/.test(c);
  return (
    piecewiseAffine(asNum(real, isDigit, 10), asNum(fake, isDigit, 10), 10) ||
    piecewiseAffine(asNum(real, isAlpha, 26), asNum(fake, isAlpha, 26), 26)
  );
}

/** Every category whose generator re-derives its seed from the value. */
const CASES: [string, string][] = [
  ["PHONE", "+33 6 12 34 56 78"],
  ["PHONE", "01 45 67 89 10"],
  ["IBAN", "FR7630006000011234567890189"],
  ["CARD", "4539148803436467"],
  ["COMPANY_ID", "863 471 587 00015"],
  ["NATIONAL_ID", "1 84 12 75 116 001 42"],
  ["ID", "AB1234567"],
];

describe("no fake encodes its own input", () => {
  for (const [category, real] of CASES) {
    for (const [label, key] of [["legacy salt", undefined], ["keyed", KEY]] as const) {
      it(`${category} — ${real} (${label})`, () => {
        const fake = fakeFor(category, real, 0, undefined, 0x2f6b91c4, undefined, key);
        expect(fake).not.toBe(real);
        expect(piecewiseAffine(digits(real), digits(fake), 10)).toBe(false);
      });
    }
  }

  it("MRZ — the letters carry the holder's name", () => {
    const real = "IDFRASABOURDIN<<<<<<<<<<<<<<<<";
    for (const key of [undefined, KEY]) {
      const fake = fakeFor("MRZ", real, 0, undefined, 0x11aa22bb, undefined, key);
      expect(fake).not.toBe(real);
      expect(mrzAffine(alnum(real), alnum(fake))).toBe(false);
    }
  });

  it("IPv4 octets are drawn from the seed, and stay in range", () => {
    for (const real of ["10.0.0.1", "192.168.14.203", "8.8.8.8"]) {
      const fake = fakeIp(real, 0x7c1a55e0);
      expect(fake).not.toBe(real);
      for (const oct of fake.split(".")) expect(Number(oct)).toBeLessThanOrEqual(255);
      expect(piecewiseAffine(digits(real), digits(fake), 10)).toBe(false);
    }
  });
});

describe("the generators keep their contract", () => {
  const salt = 0x2f6b91c4;

  it("stays deterministic for one value (identity atomicity)", () => {
    expect(fakeDigits("863 471 587 00015", salt)).toBe(fakeDigits("863 471 587 00015", salt));
  });

  it("shifts with the conversation salt", () => {
    expect(fakeDigits("863 471 587 00015", salt)).not.toBe(fakeDigits("863 471 587 00015", salt + 1));
  });

  it("keeps the layout", () => {
    expect(fakeDigits("863 471 587 00015", salt)).toMatch(/^\d{3} \d{3} \d{3} \d{5}$/);
  });

  it("gives one number written two ways the same digits", () => {
    const a = fakeDigits("863 471 587 00015", salt).replace(/\D/g, "");
    const b = fakeDigits("863471587 000 15", salt).replace(/\D/g, "");
    expect(a).toBe(b);
  });
});
