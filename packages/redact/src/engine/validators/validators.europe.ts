// Checksum / structural validators for the European identity schemes added beyond the
// presidio port (see rules.international.europe.ts). Each receives the RAW matched
// string (separators included) and must be pure. Test vectors: rules.world.test.ts.

const digits = (s: string): string => s.replace(/\D/g, "");

/** Belgium — numéro de registre national (11 digits, YY MM DD SSS CC). Check = 97 −
 *  (first 9 mod 97); for people born ≥ 2000 the number is checked with a leading "2".
 *  Bis-register months (+20 / +40) are real, so the month is not constrained here —
 *  the mod-97 is the strong signal (like the IBAN's). */
export function beNnValid(match: string): boolean {
  const d = digits(match);
  if (d.length !== 11) return false;
  const base = Number(d.slice(0, 9));
  const check = Number(d.slice(9));
  if (97 - (base % 97) === check) return true;
  return 97 - (Number("2" + d.slice(0, 9)) % 97) === check;
}

/** Switzerland — AVS/AHV (13 digits, world-unique `756` prefix). EAN-13 checksum. */
export function chAvsValid(match: string): boolean {
  const d = digits(match);
  if (d.length !== 13 || !d.startsWith("756")) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(d[12]);
}

const luhnCheckDigit = (base: string): number => {
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    let v = Number(base[base.length - 1 - i]);
    if (i % 2 === 0) {
      v *= 2;
      if (v > 9) v -= 9;
    }
    sum += v;
  }
  return (10 - (sum % 10)) % 10;
};

/** Luxembourg — matricule (13 digits: YYYYMMDD + 3-digit order + 2 checks). The 12th
 *  digit is a Luhn check over the first 11; the 13th (Verhoeff) is not re-verified —
 *  date + Luhn already brings the false-positive rate far below the bar. */
export function luMatriculeValid(match: string): boolean {
  const d = digits(match);
  if (d.length !== 13) return false;
  const y = Number(d.slice(0, 4));
  if (y < 1890 || y > 2099) return false;
  return luhnCheckDigit(d.slice(0, 11)) === Number(d[11]);
}

/** Netherlands — BSN (9 digits, "11-proef": Σ dᵢ·wᵢ with w = 9..2,−1 ≡ 0 mod 11). */
export function nlBsnValid(match: string): boolean {
  const d = digits(match);
  if (d.length !== 9 || /^0{9}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(d[i]) * (9 - i);
  sum -= Number(d[8]);
  return sum % 11 === 0;
}

/** Portugal — NIF (9 digits, mod-11 check digit; first digit from the issued set). */
export function ptNifValid(match: string): boolean {
  const d = digits(match);
  if (d.length !== 9 || !/^[1235689]/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(d[i]) * (9 - i);
  const r = sum % 11;
  return (r < 2 ? 0 : 11 - r) === Number(d[8]);
}

/** Ireland — PPS number (7 digits + check letter [+ range letter A/B/H/W]).
 *  mod-23: Σ dᵢ·(8−i) + 9·value(2nd letter, W=0) → "WABC…V"[sum % 23]. */
export function iePpsValid(match: string): boolean {
  const m = /^(\d{7})([A-Wa-w])([A-Wa-w])?$/.exec(match.replace(/[\s-]/g, ""));
  if (!m) return false;
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(m[1][i]) * (8 - i);
  if (m[3]) {
    const second = m[3].toUpperCase();
    sum += second === "W" ? 0 : 9 * (second.charCodeAt(0) - 64);
  }
  return "WABCDEFGHIJKLMNOPQRSTUV"[sum % 23] === m[2].toUpperCase();
}

/** Norway — fødselsnummer (11 digits, DDMMYY + 5, TWO weighted mod-11 checks). */
export function noFnrValid(match: string): boolean {
  const d = digits(match);
  if (d.length !== 11) return false;
  const day = Number(d.slice(0, 2)) % 40; // D-numbers add 40 to the day
  const month = Number(d.slice(2, 4));
  if (day < 1 || day > 31 || month < 1 || month > 12) return false;
  const n = d.split("").map(Number);
  const w1 = [3, 7, 6, 1, 8, 9, 4, 5, 2];
  let k1 = 11 - (w1.reduce((s, w, i) => s + w * n[i], 0) % 11);
  if (k1 === 11) k1 = 0;
  if (k1 === 10 || k1 !== n[9]) return false;
  const w2 = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let k2 = 11 - (w2.reduce((s, w, i) => s + w * n[i], 0) % 11);
  if (k2 === 11) k2 = 0;
  return k2 !== 10 && k2 === n[10];
}

/** Czechia/Slovakia — rodné číslo (YYMMDD/SSSC, 10 digits ≡ 0 mod 11; women's month
 *  +50, the +20 ECP variant tolerated). The 9-digit pre-1954 form has no checksum and
 *  is left to the gate's context alone — this validator handles the 10-digit form. */
export function czRcValid(match: string): boolean {
  const d = digits(match);
  if (d.length === 9) return true; // pre-1954: no check digit exists
  if (d.length !== 10) return false;
  const month = Number(d.slice(2, 4)) % 50;
  const day = Number(d.slice(4, 6));
  if (month < 1 || (month > 12 && (month < 21 || month > 32)) || day < 1 || day > 31) return false;
  return Number(d) % 11 === 0;
}

/** Austria — SVNR (10 digits: SSS C DDMMYY; weighted check on the 4th digit). */
export function atSvnrValid(match: string): boolean {
  const d = digits(match);
  if (d.length !== 10) return false;
  const n = d.split("").map(Number);
  const w = [3, 7, 9, 0, 5, 8, 4, 2, 1, 6];
  const sum = n.reduce((s, v, i) => (i === 3 ? s : s + v * w[i]), 0);
  return sum % 11 === n[3];
}

/** Greece — AMKA (11 digits: DDMMYY + 4 + Luhn check over the whole number). */
export function grAmkaValid(match: string): boolean {
  const d = digits(match);
  if (d.length !== 11) return false;
  const day = Number(d.slice(0, 2));
  const month = Number(d.slice(2, 4));
  if (day < 1 || day > 31 || month < 1 || month > 12) return false;
  return luhnCheckDigit(d.slice(0, 10)) === Number(d[10]);
}

/** Denmark — CPR (DDMMYY-SSSS). The mod-11 rule was officially abandoned in 2007, so
 *  this is STRUCTURAL only (valid date) — which is why the rule stays context-gated. */
export function dkCprValid(match: string): boolean {
  const d = digits(match);
  if (d.length !== 10) return false;
  const day = Number(d.slice(0, 2));
  const month = Number(d.slice(2, 4));
  return day >= 1 && day <= 31 && month >= 1 && month <= 12;
}

// ── EU VAT checksums (the country-prefixed forms are distinctive; these make them
// fire bare without grabbing a look-alike code) ───────────────────────────────

/** Belgium — VAT (BE0/BE1 + 9 digits; last two = 97 − (first 8 mod 97)). */
export function beVatValid(match: string): boolean {
  const d = digits(match);
  if (d.length !== 10) return false;
  return 97 - (Number(d.slice(0, 8)) % 97) === Number(d.slice(8));
}

/** Poland — NIP (10 digits, weighted mod-11; check can't be 10). */
export function plNipValid(match: string): boolean {
  const d = digits(match);
  if (d.length !== 10) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const c = w.reduce((s, wi, i) => s + wi * Number(d[i]), 0) % 11;
  return c !== 10 && c === Number(d[9]);
}

/** Sweden — VAT (10-digit Luhn organisationsnummer + "01" suffix). */
export function seVatValid(match: string): boolean {
  const d = digits(match);
  if (d.length !== 12 || !d.endsWith("01")) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let v = Number(d[9 - i]) * (i % 2 === 1 ? 2 : 1);
    if (v > 9) v -= 9;
    sum += v;
  }
  return sum % 10 === 0;
}

/** Denmark — CVR (8 digits, weighted mod-11 ≡ 0). */
export function dkCvrValid(match: string): boolean {
  const d = digits(match);
  if (d.length !== 8) return false;
  const w = [2, 7, 6, 5, 4, 3, 2, 1];
  return w.reduce((s, wi, i) => s + wi * Number(d[i]), 0) % 11 === 0;
}
