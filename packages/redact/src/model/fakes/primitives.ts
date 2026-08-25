// Low-level deterministic string generators shared by the entity/path/dispatch fakers.
// All are pure functions of the value (stable within a run), so a fake leaks no size hint.

export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function pick<T>(arr: T[], n: number): T {
  return arr[n % arr.length];
}

/**
 * A SECOND index off the same salted hash, INDEPENDENT of the first.
 *
 * `pick` is `n % len`, so drawing a second pool of the SAME size with `h + 1` always
 * lands one slot past the first: the pair only ever takes `len` values instead of
 * `len²` — 16 full names rather than 256 — and the fake surname becomes a pure
 * function of the fake first name. Two pools that look independent, and are not.
 * A murmur3 finalizer re-mixes the LOW bits, which are the only ones `pick` reads.
 */
export function rehash(h: number): number {
  let x = h | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x = (x ^ (x >>> 16)) | 0;
  return Math.abs(x);
}

/** Replace each digit of `value` with a deterministic different one, keeping shape. */
export function fakeDigits(value: string, salt: number): string {
  // A WRAPPED value (the spaced rules tolerate one mid-value line break) must NOT
  // mirror its newline into the FAKE: a model normalises line breaks when echoing,
  // and a reformatted fake no longer reverse-maps — so the fake is laid out
  // single-line (the wrap becomes one space). The REAL value in the vault keeps its
  // newline verbatim; only the fake's layout is flattened.
  const flat = value.replace(/[ \t]*\r?\n[ \t]*/g, " ");
  // Seed on the DIGITS ONLY (not the raw value) so the SAME number written with
  // different spacing/grouping — "863 471 587 00015" vs "863 471 587 000 15" — yields
  // the SAME fake digits, re-laid-out under each spelling's own separators. Seeding on
  // the raw value hashed the two spellings differently → two unrelated fakes for one
  // number (the reported "2 mappings différents"). `unredact` is already separator-
  // insensitive, so the reverse was fine; this makes the FORWARD fake consistent too.
  // FULLWIDTH digits (０-９, CJK documents) swap within their own width class — an
  // ASCII digit in a fullwidth id would read broken AND the identity pass-through
  // guard would otherwise kick the value to the neutral fallback.
  const h = hashString(flat.replace(/[^\d０-９]/g, "").replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xff10))) + salt;
  let i = 0;
  return flat.replace(/[\d０-９]/g, (d) => {
    const full = d >= "０";
    const n = full ? d.charCodeAt(0) - 0xff10 : Number(d);
    const f = (h + i++ * 7 + n + 3) % 10;
    return full ? String.fromCharCode(0xff10 + f) : String(f);
  });
}

const FILL = "abcdefghijklmnopqrstuvwxyz";

/**
 * Deterministically pad/trim a word-like string to EXACTLY `target` characters,
 * so a fake (name/org/city/address/email) keeps the original's length — preserving
 * layout and token counts, and giving nothing away by its size. Padding appends
 * lowercase letters (stays word-like); trimming never leaves a trailing separator.
 */
export function fitLen(s: string, target: number, seed: number): string {
  if (target <= 0) return "";
  if (s.length === target) return s;
  if (s.length > target) {
    let cut = s.slice(0, target);
    if (/[^A-Za-z0-9]$/.test(cut)) cut = cut.slice(0, -1) + FILL[seed % 26];
    return cut;
  }
  let h = seed >>> 0;
  let out = s;
  while (out.length < target) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    out += FILL[h % 26];
  }
  return out;
}

/** The Luhn check digit that makes `digitsWithoutCheck` + it validate. */
export function luhnCheckDigit(digitsWithoutCheck: string): number {
  let sum = 0;
  let dbl = true; // the digit RIGHT BEFORE the check digit is doubled
  for (let i = digitsWithoutCheck.length - 1; i >= 0; i--) {
    let d = Number(digitsWithoutCheck[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    dbl = !dbl;
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

/** mod-97 over an IBAN-style alphanumeric string (letters → 10..35), digit-wise. */
export function mod97(s: string): number {
  let rem = 0;
  for (const ch of s) {
    const piece = /[0-9]/.test(ch) ? ch : String(ch.toUpperCase().charCodeAt(0) - 55);
    for (const d of piece) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem;
}

/** Scramble every alphanumeric char PRESERVING each character's CLASS (lower stays
 *  lower, upper stays upper, digit stays digit) — a handle/pseudo whose fake keeps the
 *  original's silhouette instead of the full-scramble's ransom-note casing. NOT for
 *  secrets: `fakeToken` deliberately destroys everything there. */
export function fakeHandle(value: string, seed: number): string {
  const LOWER = "abcdefghijklmnopqrstuvwxyz";
  let h = seed >>> 0;
  const next = (n: number) => ((h = (Math.imul(h, 1103515245) + 12345) >>> 0), h % n);
  return Array.from(value, (c) => {
    if (/[a-z]/.test(c)) return LOWER[next(26)];
    if (/[A-Z]/.test(c)) return LOWER[next(26)].toUpperCase();
    if (/[0-9]/.test(c)) return String(next(10));
    return c;
  }).join("");
}

/** Scramble every alphanumeric char (keeping separators) → a fake same-shape token. */
export function fakeToken(value: string, seed: number): string {
  const ALNUM =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let h = seed >>> 0;
  let out = "";
  for (const c of value) {
    if (/[A-Za-z0-9]/.test(c)) {
      h = (Math.imul(h, 1103515245) + 12345) >>> 0;
      out += ALNUM[h % ALNUM.length];
    } else {
      out += c; // keep -, _, ., : separators so the shape stays plausible
    }
  }
  return out;
}
