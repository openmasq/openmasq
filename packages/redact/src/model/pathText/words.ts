/**
 * Word-level primitives of a path segment: how it is cut into tokens, which token is an
 * IDENTIFIER (masked at every level), and the PRONOUNCEABLE fake a word gets at Strict.
 */
import { fakeHandle, hashString, seedFrom } from "../fakes/primitives";

/** One alphanumeric run of a segment, with its offset. Everything between two tokens is a
 *  separator (`space _ - . ( ) &` …) and is copied verbatim. */
export interface Token {
  text: string;
  start: number;
}

const TOKEN = /[\p{L}\p{M}\p{N}]+/gu;

export function tokensOf(text: string): Token[] {
  return [...text.matchAll(TOKEN)].map((m) => ({ text: m[0], start: m.index ?? 0 }));
}

/**
 * The segment as DETECTION reads it: `_` always, and `-`/`.` between two letters, become a
 * space (« Invoice_Acme_Corp » → « Invoice Acme Corp »). Character for character, so an
 * offset in the spaced text IS the offset in the original — mapping a finding back to the
 * segment's own spelling is a slice.
 */
export function spacedForDetection(seg: string): string {
  return seg.replace(/_|(?<=\p{L})[-.](?=\p{L})/gu, " ");
}

/**
 * A token that IDENTIFIES rather than counts: 5+ digits (a registry, a case or an account
 * number), or letters and digits mixed with 4+ digits (« 2022B48213 »). Counters, years,
 * versions and short codes (`001`, `2025`, `v2`, `Q3`, `W-2`) are not.
 */
export function isIdentifierToken(t: string): boolean {
  const digits = (t.match(/\p{N}/gu) ?? []).length;
  if (!digits) return false;
  if (digits === t.length) return digits >= 5;
  return digits >= 4 && t.length >= 6;
}

/** Same-shape fake of an identifier token: every digit redrawn, every letter redrawn in its
 *  own case — the reader still sees « a registry number », never the number. */
export function fakeIdentifier(t: string, seed: number): string {
  let out = fakeHandle(t, seed);
  for (let k = 1; out === t && k < 8; k++) out = fakeHandle(t, seed + k * 7919);
  return out;
}

const CONSONANTS = "bcdfghjklmnprstvz";
const VOWELS = "aeiou";

/**
 * A PRONOUNCEABLE stand-in for a word, same letter count, same casing pattern (UPPER,
 * Capitalised, lower): `projet-alpha` reads as words, not as a character soup. Never the
 * word itself.
 */
export function pronounceable(word: string, seed: number): string {
  const n = [...word].length;
  const startVowel = /^[aeiouyàâäéèêëîïôöûüù]/i.test(word);
  for (let k = 0; k < 8; k++) {
    let h = (seed + k * 104729) >>> 0;
    const next = (m: number) => ((h = (Math.imul(h, 1103515245) + 12345) >>> 0), (h >>> 8) % m);
    let s = "";
    for (let i = 0; i < n; i++) {
      const vowel = (i % 2 === 0) === startVowel;
      s += vowel ? VOWELS[next(VOWELS.length)] : CONSONANTS[next(CONSONANTS.length)];
    }
    const out = recase(s, word);
    if (out.toLowerCase() !== word.toLowerCase()) return out;
  }
  return recase("x".repeat(n), word);
}

/** Copy `like`'s casing pattern onto `s`: ALL-CAPS, Capitalised, or lowercase. */
function recase(s: string, like: string): string {
  if (like.length > 1 && like === like.toUpperCase() && like !== like.toLowerCase()) return s.toUpperCase();
  if (like[0] && like[0] !== like[0].toLowerCase()) return s[0].toUpperCase() + s.slice(1).toLowerCase();
  return s.toLowerCase();
}

/** The seed of one word's fake: per conversation (key, else salt folded in `attempt`) and on
 *  the LOWERCASED word, so one word keeps one fake in every segment and every casing. */
export function wordSeed(kind: string, word: string, attempt: number, convKey?: Uint8Array): number {
  const norm = word.toLowerCase();
  return seedFrom(convKey, `path${kind}:${attempt}`, norm, (hashString(norm) + attempt * 7919) >>> 0);
}
