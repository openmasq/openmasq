// French checksummed schemes — the FR-first coverage (NIR, SIREN/SIRET, TVA, RIB).
// Contract: `is` recognises the COMPACT original; `fake` returns a same-length
// compact candidate that PASSES the scheme's validator, or null (caller retries).
import { frVat, siret, sirenSiret } from "../../../engine/validators";
import { ribValid } from "../../../engine/validators/validators.identifiers";
import { luhnCheckDigit } from "../primitives";
import { DIGITS, draw, p2, p3, type Rng } from "./helpers";
import type { IdScheme } from "./types";

/** A Luhn-valid 9-digit SIREN. */
function makeSiren(rng: Rng): string {
  const body = draw(rng, 8);
  return body + luhnCheckDigit(body);
}

/** The NIR's mod-97 key, with the official Corsican substitution (2A→19, 2B→18)
 *  applied to the 13-digit stem before the modulo. */
function nirKey(stem13: string): string {
  const n = stem13.replace(/2A/i, "19").replace(/2B/i, "18");
  let rem = 0;
  for (const c of n) rem = (rem * 10 + (c.charCodeAt(0) - 48)) % 97;
  return p2(97 - rem);
}

const NIR_RE = /^[12]\d{2}(?:0[1-9]|1[0-2])(?:\d{2}|2[AB])\d{6}(?:\d{2})?$/i;

/** France RIB key — banque(5) + guichet(5) + compte(11, letters transliterated)
 *  must satisfy (89b + 15g + 3c + clé) ≡ 0 (mod 97). Shared with `fakeIban` so a
 *  French IBAN's EMBEDDED RIB key also validates, not only the mod-97 IBAN key. */
const RIB_LETTER: Record<string, string> = {
  A: "1", J: "1", B: "2", K: "2", S: "2", C: "3", L: "3", T: "3",
  D: "4", M: "4", U: "4", E: "5", N: "5", V: "5", F: "6", O: "6", W: "6",
  G: "7", P: "7", X: "7", H: "8", Q: "8", Y: "8", I: "9", R: "9", Z: "9",
};
function mod97Part(numStr: string, factor: number): number {
  let rem = 0;
  for (const ch of numStr) rem = (rem * 10 + (ch.charCodeAt(0) - 48)) % 97;
  return (rem * factor) % 97;
}
export function ribKey(banque: string, guichet: string, compte: string): string | null {
  let compteDigits = "";
  for (const c of compte.toUpperCase()) {
    if (c >= "0" && c <= "9") compteDigits += c;
    else if (RIB_LETTER[c]) compteDigits += RIB_LETTER[c];
    else return null;
  }
  const sum = (mod97Part(banque, 89) + mod97Part(guichet, 15) + mod97Part(compteDigits, 3)) % 97;
  return p2(97 - sum);
}

export const FRANCE_SCHEMES: IdScheme[] = [
  {
    id: "fr_nir",
    cat: "national_id",
    is: (c) => NIR_RE.test(c),
    // Keep the SEX digit (the same derived-attribute rule as names keeping
    // gender), swap everything else, keep a Corsican département Corsican (its
    // letter is part of the SHAPE), recompute the key when the original has one.
    fake: (c, rng) => {
      const corse = /2[AB]/i.test(c.slice(5, 7));
      // Métropole 01-95, never the numeric 20 (Corsica IS 2A/2B).
      let d = 1 + rng(95);
      if (d === 20) d = 21;
      const dept = corse ? "2" + "AB"[rng(2)] : p2(d);
      const stem =
        c[0] + p2(rng(100)) + p2(1 + rng(12)) + dept + p3(1 + rng(899)) + p3(1 + rng(999));
      return c.length === 15 ? stem + nirKey(stem) : stem;
    },
  },
  {
    id: "fr_siret",
    cat: "company_id",
    is: (c) => /^\d{14}$/.test(c) && siret(c),
    // Double Luhn by construction: a valid SIREN, then the NIC's own check digit
    // over the full 14 — the exact property the bare-SIRET shape rule fires on.
    fake: (c, rng) => {
      const first13 = makeSiren(rng) + draw(rng, 4);
      return first13 + luhnCheckDigit(first13);
    },
  },
  {
    id: "fr_siren",
    cat: "company_id",
    is: (c) => /^\d{9}$/.test(c) && sirenSiret(c),
    fake: (c, rng) => makeSiren(rng),
  },
  {
    id: "fr_vat",
    cat: "company_id",
    is: (c) => /^FR\d{11}$/i.test(c) && frVat(c),
    fake: (c, rng) => {
      const siren = makeSiren(rng);
      return "FR" + p2((12 + 3 * (Number(siren) % 97)) % 97) + siren;
    },
  },
  {
    id: "fr_rib",
    cat: "bank_route",
    is: (c) => /^\d{10}[0-9A-Z]{11}\d{2}$/i.test(c) && ribValid(c),
    // Account LETTERS are kept verbatim (the fakeIban doctrine: they carry
    // bank-format, not identity beyond what the digit swap hides).
    fake: (c, rng) => {
      const banque = draw(rng, 5);
      const guichet = draw(rng, 5);
      let compte = "";
      for (const ch of c.slice(10, 21)) compte += /\d/.test(ch) ? DIGITS[rng(10)] : ch;
      const key = ribKey(banque, guichet, compte);
      return key ? banque + guichet + compte + key : null;
    },
  },
];
