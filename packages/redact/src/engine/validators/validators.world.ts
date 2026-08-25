// Checksum validators for the Americas / Asia-Pacific / global schemes added beyond
// the presidio port (rules.international.{us,apac,latam}.ts + rules.global.ts).
// Pure; each receives the RAW matched string. Test vectors: rules.world.test.ts.

const digits = (s: string): string => s.replace(/\D/g, "");

/** Brazil — CPF (11 digits, TWO weighted mod-11 check digits; all-same rejected). */
export function brCpfValid(match: string): boolean {
  const d = digits(match);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const n = d.split("").map(Number);
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += n[i] * (len + 1 - i);
    const r = (sum * 10) % 11 === 10 ? 0 : (sum * 10) % 11;
    if (r !== n[len]) return false;
  }
  return true;
}

/** Brazil — CNPJ (14 digits, two weighted mod-11 checks). */
export function brCnpjValid(match: string): boolean {
  const d = digits(match);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const n = d.split("").map(Number);
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, ...w1];
  for (const [w, pos] of [
    [w1, 12],
    [w2, 13],
  ] as const) {
    const sum = w.reduce((s, wi, i) => s + wi * n[i], 0);
    const r = sum % 11;
    if ((r < 2 ? 0 : 11 - r) !== n[pos]) return false;
  }
  return true;
}

/** Chile — RUT/RUN (7-8 digits + DV, mod-11 with cycling 2..7 weights; DV K = 10). */
export function clRutValid(match: string): boolean {
  const m = /^(\d{7,8})[\s.-]*([\dkK])$/.exec(match.replace(/\./g, ""));
  if (!m) return false;
  let sum = 0;
  let w = 2;
  for (let i = m[1].length - 1; i >= 0; i--) {
    sum += Number(m[1][i]) * w;
    w = w === 7 ? 2 : w + 1;
  }
  const r = 11 - (sum % 11);
  const dv = r === 11 ? "0" : r === 10 ? "K" : String(r);
  return dv === m[2].toUpperCase();
}

/** Mexico — CURP (18 chars, positional dictionary check digit incl. Ñ). */
export function mxCurpValid(match: string): boolean {
  const v = match.toUpperCase();
  if (!/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(v)) return false;
  const dic = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += dic.indexOf(v[i]) * (18 - i);
  return (10 - (sum % 10)) % 10 === Number(v[17]);
}

/** Argentina — CUIT/CUIL (11 digits, weighted mod-11; r=10 is not issued). */
export function arCuitValid(match: string): boolean {
  const d = digits(match);
  if (d.length !== 11) return false;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = w.reduce((s, wi, i) => s + wi * Number(d[i]), 0);
  const r = 11 - (sum % 11);
  if (r === 10) return false;
  return (r === 11 ? 0 : r) === Number(d[10]);
}

/** China — resident identity card (17 digits + ISO 7064 mod 11-2 check, X = 10). */
export function cnIdValid(match: string): boolean {
  const v = match.toUpperCase();
  if (!/^\d{17}[\dX]$/.test(v)) return false;
  const w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const sum = w.reduce((s, wi, i) => s + wi * Number(v[i]), 0);
  return "10X98765432"[sum % 11] === v[17];
}

/** Hong Kong — HKID (1-2 letters + 6 digits + check, A = 10; parens tolerated). */
export function hkHkidValid(match: string): boolean {
  const v = match.toUpperCase().replace(/[()\s]/g, "");
  const m = /^([A-Z]{1,2})(\d{6})([0-9A])$/.exec(v);
  if (!m) return false;
  const letters = m[1].length === 2 ? m[1] : " " + m[1];
  const val = (c: string): number => (c === " " ? 36 : c.charCodeAt(0) - 55);
  let sum = val(letters[0]) * 9 + val(letters[1]) * 8;
  for (let i = 0; i < 6; i++) sum += Number(m[2][i]) * (7 - i);
  const check = m[3] === "A" ? 10 : Number(m[3]);
  return (sum + check) % 11 === 0;
}

/** Japan — My Number (12 digits, positional weighted mod-11 check). */
export function jpMyNumberValid(match: string): boolean {
  const d = digits(match);
  if (d.length !== 12) return false;
  let sum = 0;
  for (let n = 1; n <= 11; n++) {
    const p = Number(d[11 - n]);
    sum += p * (n <= 6 ? n + 1 : n - 5);
  }
  const r = sum % 11;
  return (r <= 1 ? 0 : 11 - r) === Number(d[11]);
}

/** Israel — Teudat Zehut (9 digits, Luhn-style ≡ 0 mod 10). */
export function ilIdValid(match: string): boolean {
  const d = digits(match);
  if (d.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let v = Number(d[i]) * (i % 2 === 0 ? 1 : 2);
    if (v > 9) v -= 9;
    sum += v;
  }
  return sum % 10 === 0;
}

/** New Zealand — IRD number (8-9 digits, two-phase weighted mod-11 + issued range). */
export function nzIrdValid(match: string): boolean {
  const d = digits(match);
  const num = Number(d);
  if (num < 10_000_000 || num > 150_000_000) return false;
  const padded = d.padStart(9, "0");
  const base = padded.slice(0, 8).split("").map(Number);
  const check = Number(padded[8]);
  const calc = (w: number[]): number => {
    const r = w.reduce((s, wi, i) => s + wi * base[i], 0) % 11;
    return r === 0 ? 0 : 11 - r;
  };
  let c = calc([3, 2, 7, 6, 5, 4, 3, 2]);
  if (c === 10) c = calc([7, 4, 3, 2, 5, 2, 7, 6]);
  return c !== 10 && c === check;
}

/** Australia — TFN (8-9 digits, weighted sum ≡ 0 mod 11). */
export function auTfnValid(match: string): boolean {
  const d = digits(match);
  const w = d.length === 9 ? [1, 4, 3, 7, 5, 8, 6, 9, 10] : d.length === 8 ? [10, 7, 8, 4, 6, 3, 5, 1] : null;
  if (!w) return false;
  return w.reduce((s, wi, i) => s + wi * Number(d[i]), 0) % 11 === 0;
}

/** Australia — ABN (11 digits; first digit −1, weighted sum ≡ 0 mod 89). */
export function auAbnValid(match: string): boolean {
  const d = digits(match);
  if (d.length !== 11) return false;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const sum = w.reduce((s, wi, i) => s + wi * (Number(d[i]) - (i === 0 ? 1 : 0)), 0);
  return sum % 89 === 0;
}

/** Australia — ACN (9 digits, complement-of-mod-10 check on weights 8..1). */
export function auAcnValid(match: string): boolean {
  const d = digits(match);
  if (d.length !== 9) return false;
  const sum = [8, 7, 6, 5, 4, 3, 2, 1].reduce((s, wi, i) => s + wi * Number(d[i]), 0);
  return (10 - (sum % 10)) % 10 === Number(d[8]);
}

/** Australia — Medicare (10-11 digits, first 2-6, weighted mod-10 check at pos 9). */
export function auMedicareValid(match: string): boolean {
  const d = digits(match);
  if ((d.length !== 10 && d.length !== 11) || !/^[2-6]/.test(d)) return false;
  const w = [1, 3, 7, 9, 1, 3, 7, 9];
  const sum = w.reduce((s, wi, i) => s + wi * Number(d[i]), 0);
  return sum % 10 === Number(d[8]);
}

// ── Machine-readable zone (ICAO 9303) ────────────────────────────────────────
// An OCR'd passport / CNI / titre de séjour contains MRZ lines — long runs of
// [A-Z0-9<]. The NAME line is self-evident (`P<FRAMARTIN<<JULIEN…`); a DATA line is
// verified via its embedded check digits (values A=10…Z=35, '<'=0, weights 7-3-1).

const mrzCheckDigit = (s: string): number => {
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const v = c === "<" ? 0 : /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 55;
    sum += v * w[i % 3];
  }
  return sum % 10;
};

/** True for a plausible MRZ line: full length (TD1/TD2/TD3 = 30/36/44), and either a
 *  NAME line (`<<` between surname and given names) or a DATA line whose document-
 *  number and/or birth-date check digits verify (OCR-tolerant: ONE of them suffices). */
export function mrzLineValid(match: string): boolean {
  const v = match;
  if (v.length < 30 || v.length > 44) return false;
  if (v.includes("<<")) return true; // name line — nothing else looks like this
  // TD3 data line: doc(9)+cd(1) … birth(6)+cd(1) at positions 13-19/19.
  const docOk = /\d/.test(v[9]) && mrzCheckDigit(v.slice(0, 9)) === Number(v[9]);
  const birthOk =
    v.length === 44 && /\d/.test(v[19]) && mrzCheckDigit(v.slice(13, 19)) === Number(v[19]);
  // TD1 line 2 carries birth at 0-5 with cd at 6.
  const td1Ok = v.length === 30 && /^\d{6}\d/.test(v) && mrzCheckDigit(v.slice(0, 6)) === Number(v[6]);
  return docOk || birthOk || td1Ok;
}

/** LEI — ISO 17442 (20 chars, ISO 7064 mod 97-10 over base-36 values ≡ 1). */
export function leiValid(match: string): boolean {
  const v = match.toUpperCase();
  if (!/^[A-Z0-9]{18}\d{2}$/.test(v)) return false;
  let rem = 0;
  for (const c of v) {
    const val = String(parseInt(c, 36)); // "0".."9" → 1 char, "A".."Z" → 2 chars
    for (const ch of val) rem = (rem * 10 + Number(ch)) % 97;
  }
  return rem === 1;
}

/** Mexico — CLABE (18 digits, weighted 3-7-1 mod-10 check). */
export function mxClabeValid(match: string): boolean {
  const d = digits(match);
  if (d.length !== 18) return false;
  const w = [3, 7, 1];
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(d[i]) * w[i % 3];
  return (10 - (sum % 10)) % 10 === Number(d[17]);
}
