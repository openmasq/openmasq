// Checksum validators for the INTERNATIONAL identity schemes ported from
// presidio-ts (`packages/analyzer/src/predefined/country/**`). Each mirrors the
// upstream `validateResult` logic so a shape-based rule only redacted a match
// that actually checksums — the same precision bar as the built-in
// card (Luhn) / IBAN (mod-97) rules. Pure, unit-testable, no deps.

/** Luhn (mod-10) over a pure digit string. */
function luhn10(d: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

const digitsOf = (s: string): string => s.replace(/\D/g, "");

/** Poland PESEL — weighted mod-10 check digit (weights 1,3,7,9 repeating). */
export function peselValid(match: string): boolean {
  const t = match.trim();
  if (t.length !== 11 || !/^\d+$/.test(t)) return false;
  const d = [...t].map(Number);
  const w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  let s = 0;
  for (let i = 0; i < 10; i++) s += (d[i] ?? 0) * (w[i] ?? 0);
  return (10 - (s % 10)) % 10 === d[10];
}

const NIF_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

/** Spain NIF/DNI — mod-23 letter over the 7–8 digit body. */
export function esNifValid(match: string): boolean {
  const t = match.toUpperCase();
  const letter = t[t.length - 1];
  const n = parseInt(digitsOf(t), 10);
  if (!Number.isFinite(n)) return false;
  return letter === NIF_LETTERS[n % 23];
}

/** Spain NIE — X/Y/Z prefix mapped to 0/1/2, then the NIF mod-23 letter. */
export function esNieValid(match: string): boolean {
  const t = match.replace(/[-\s]/g, "").toUpperCase();
  if (t.length < 8 || t.length > 9) return false;
  const first = t[0] ?? "";
  const idx = "XYZ".indexOf(first);
  if (idx < 0) return false;
  const letter = t[t.length - 1];
  const n = parseInt(String(idx) + t.slice(1, -1), 10);
  if (!Number.isFinite(n)) return false;
  return letter === NIF_LETTERS[n % 23];
}

/** Canada SIN — Luhn over the 9 digits. */
export function caSinValid(match: string): boolean {
  const d = digitsOf(match);
  return d.length === 9 && luhn10(d);
}

/** US NPI — Luhn over "80840" + the first 9 digits, checked against the 10th. */
export function usNpiValid(match: string): boolean {
  const d = digitsOf(match);
  if (d.length !== 10) return false;
  if (new Set(d.slice(0, 9)).size === 1) return false; // reject degenerate bodies
  const base = "80840" + d.slice(0, 9);
  let sum = 0;
  let dbl = true;
  for (let i = base.length - 1; i >= 0; i--) {
    let n = base.charCodeAt(i) - 48;
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return (10 - (sum % 10)) % 10 === Number(d[9]);
}

/** US ABA routing number — weighted mod-10 (3,7,1 repeating) over 9 digits. */
export function abaRoutingValid(match: string): boolean {
  const d = digitsOf(match);
  if (d.length !== 9) return false;
  const w = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  let s = 0;
  for (let i = 0; i < 9; i++) s += Number(d[i]) * (w[i] ?? 0);
  return s % 10 === 0;
}

/** UK NHS number — mod-11 over 10 digits (weights 10..1), remainder 0. */
export function ukNhsValid(match: string): boolean {
  const d = digitsOf(match);
  if (d.length !== 10) return false;
  let total = 0;
  for (let i = 0; i < 10; i++) total += Number(d[i]) * (10 - i);
  return total % 11 === 0;
}

/** Turkey T.C. Kimlik No — two check digits (NVI algorithm). */
export function trNationalIdValid(match: string): boolean {
  const d = digitsOf(match);
  if (d.length !== 11 || d[0] === "0") return false;
  const n = [...d].map(Number);
  let odd = 0;
  for (let i = 0; i <= 8; i += 2) odd += n[i] ?? 0;
  let even = 0;
  for (let i = 1; i <= 7; i += 2) even += n[i] ?? 0;
  const tenth = (((odd * 7 - even) % 10) + 10) % 10;
  if (tenth !== n[9]) return false;
  const eleventh = n.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return eleventh === n[10];
}

/** Thailand TNIN — weighted mod-11 (weights 13..2) with wrap on the check digit. */
export function thTninValid(match: string): boolean {
  const d = digitsOf(match);
  if (d.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (13 - i) * Number(d[i]);
  const x = sum % 11;
  const expected = x <= 1 ? 1 - x : 11 - x;
  return expected === Number(d[12]);
}

/** Germany Steuer-ID — ISO 7064 Mod 11,10 + the post-2016 max-3-repeat rule. */
export function deTaxIdValid(match: string): boolean {
  const t = digitsOf(match);
  if (t.length !== 11 || t[0] === "0") return false;
  const d = [...t].map(Number);
  const counts = new Map<number, number>();
  for (const x of d.slice(0, 10)) counts.set(x, (counts.get(x) ?? 0) + 1);
  if (Math.max(...counts.values()) > 3) return false;
  let product = 10;
  for (let i = 0; i < 10; i++) {
    let sum = ((d[i] ?? 0) + product) % 10;
    if (sum === 0) sum = 10;
    product = (sum * 2) % 11;
  }
  let check = 11 - product;
  if (check === 10) check = 0;
  return check === d[10];
}

/** Italy VAT / Partita IVA — Luhn-style mod-10 over 11 digits. */
export function itVatValid(match: string): boolean {
  const t = digitsOf(match);
  if (t.length !== 11 || t === "00000000000") return false;
  let x = 0;
  let y = 0;
  for (let i = 0; i < 5; i++) {
    x += Number(t[2 * i]);
    let ty = Number(t[2 * i + 1]) * 2;
    if (ty > 9) ty -= 9;
    y += ty;
  }
  return (10 - ((x + y) % 10)) % 10 === Number(t[10]);
}
