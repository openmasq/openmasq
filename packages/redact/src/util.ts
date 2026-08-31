/** Upper-case the first character, leaving the rest untouched. */
export const capitalize = (s: string): string =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

/** Strips diacritics (« Valère » → « Valere »). One single home for this fold:
 *  it serves gender detection (comparing a first name to an accent-free lexicon) AND
 *  building an e-mail local part, where an accent has no business being — see `identity/email.ts`. */
export const foldAccents = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** The accented variants of a base letter. Common Latin — enough for the languages
 *  the product sees, and deliberately not a full Unicode table. */
const ACCENT_VARIANTS: Record<string, string> = {
  a: "àáâãäåāăą",
  c: "çćĉċč",
  e: "èéêëēĕėęě",
  i: "ìíîïĩīĭįı",
  n: "ñńņňŉ",
  o: "òóôõöøōŏő",
  u: "ùúûüũūŭůűų",
  y: "ýÿŷ",
  s: "śŝşš",
  z: "źżž",
  g: "ĝğġģ",
  l: "ĺļľłŀ",
  t: "ţťŧ",
  d: "ďđ",
  r: "ŕŗř",
};

/**
 * The pattern for a value, TOLERANT of diacritics: every accentable letter accepts
 * its variants, in both cases.
 *
 * ⚠️ Why this is needed for the REVERSE pass: the model sometimes RE-SPELLS a
 * fake. A fake « Quémener » comes back as « Quéméner » — the model "corrects" it toward the
 * spelling it knows. The character sequence then differs by a single mark, the pattern no
 * longer recognises its own fake, and the user reads THE FAKE instead of their data
 * (observed on 15/08 on an identity card: the surname restored, the first name stayed invented).
 *
 * The input is already escaped (`escapeRegExp`): only the letters are touched, never the
 * escape sequences or the classes already built.
 */
export function accentTolerantSource(escaped: string): string {
  let out = "";
  for (const ch of escaped) {
    const base = foldAccents(ch).toLowerCase();
    const variants = ACCENT_VARIANTS[base];
    if (!variants || base.length !== 1) {
      out += ch;
      continue;
    }
    const set = base + variants;
    out += `[${set}${set.toUpperCase()}]`;
  }
  return out;
}

/** Escape a string so it can be used literally inside a `RegExp`. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace every STANDALONE occurrence of `real` with `fake`, leaving occurrences
 * GLUED inside a larger word untouched. Mirrors `applyVault`'s word-boundary guard
 * for the VISIBLE render paths (PDF paint, the preview "Redacted" text tab), which
 * otherwise did a raw `split(real).join(fake)` — so a short fake like "IE"→"De"
 * corrupted real words ("INGÉNIEURS" → "INGÉNDeURS", "PAIE" → "RouenDe"). A value
 * whose edges are punctuation/space (a proper name/city, an email, a path) still
 * replaces normally. Defined AFTER `isWordGlued` (below).
 */
export function replaceStandalone(text: string, real: string, fake: string): string {
  if (!real) return text;
  return text.replace(new RegExp(escapeRegExp(real), "g"), (m, off: number) =>
    isWordGlued(text, off, m) ? m : fake,
  );
}

/** True when `value` occurs at least once STANDALONE (not glued inside a word) in
 *  `text` — used to decide whether a redaction box should paint at all. */
export function hasStandalone(text: string, value: string): boolean {
  if (!value) return false;
  const re = new RegExp(escapeRegExp(value), "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!isWordGlued(text, m.index, m[0])) return true;
    if (m.index === re.lastIndex) re.lastIndex++; // avoid a zero-width loop
  }
  return false;
}

/**
 * Build the case-insensitive "keep" allow-list: exact values that must NEVER be
 * redacted (e.g. the names of the user's CONNECTED integrations — "Stripe",
 * "Canva" — which the chat model needs verbatim to route tool calls). Trimmed +
 * lowercased; blanks dropped.
 */
export function keepSet(keep?: string[]): Set<string> {
  return new Set((keep ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/** True when a detected span exactly matches a keep entry (case-insensitive). */
export function isKept(value: string, keep: Set<string>): boolean {
  return keep.size > 0 && keep.has(value.trim().toLowerCase());
}

/** A letter or digit in ANY script (unicode) — ASCII `\b` would treat accents as
 *  boundaries and mangle "Charvet", so we hit-test the surrounding chars ourselves. */
const WORDISH = /[\p{L}\p{N}]/u;

/**
 * True when `matched` (found at `start` in `text`) is GLUED to a longer word —
 * i.e. it continues a word on a side where its own edge is a letter/digit. Used
 * to reject a value that is only a SUBSTRING inside a real word: replacing a
 * 2-char entity like "us"/"ca" would otherwise corrupt "plus"/"vous"/"Canva".
 * A value whose edge is punctuation (an email, a path) is never "glued", so
 * structured values keep matching normally.
 */
export function isWordGlued(text: string, start: number, matched: string): boolean {
  if (!matched) return false;
  const first = matched[0];
  const last = matched[matched.length - 1];
  const before = start > 0 ? text[start - 1] : "";
  const after = start + matched.length < text.length ? text[start + matched.length] : "";
  // A neighbour hex digit that is the TAIL of a `%XX` percent-encoding (URL args) is
  // NOT a real word-glue — it's an encoded delimiter (`%22` = a quote). Without this,
  // a URL-encoded fake wrapped in `%22…%22` (a Google `q="Fake Name"` search the model
  // built) was left UN-restored by `unredactArgs`, so the FAKE leaked to the search
  // engine (the agent browser searched the fake, not the real value). `%22Jade+Savel%22`
  // → the "2" of "%22" preceded "Jade" and blocked the restore. Treat a `%XX` tail as a
  // boundary so the value still restores; a genuine glued word (`plusJade`) is unaffected.
  const HEX = /[0-9A-Fa-f]/;
  const beforePctTail = HEX.test(before) && HEX.test(text[start - 2] ?? "") && text[start - 3] === "%";
  // A DIGIT edge flanked by a CJK glyph is NOT glue: CJK prose has no spaces, so a
  // number sits directly against the surrounding characters by construction —
  // «番号：４５３９…で決済» is a standalone card number, and treating the «で» as a
  // word-glue left the value detected but IRREPLACEABLE (the fullwidth leak).
  const CJKG = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]/u;
  const DIGIT = /\p{N}/u;
  const gluedBefore =
    WORDISH.test(first) && WORDISH.test(before) && !beforePctTail &&
    !(DIGIT.test(first) && CJKG.test(before));
  const gluedAfter =
    WORDISH.test(last) && WORDISH.test(after) && !(DIGIT.test(last) && CJKG.test(after));
  // ⚠️ THE DOT IS A BINDER INSIDE AN ACRONYM, and `WORDISH` doesn't see it — « R.C » inside
  // « R.C.S. » isn't a standalone value, it's a fragment. A two-character vault
  // entry therefore rewrote « 863 471 587 R.C.S. Paris » as
  // « … GAP.S. Paris »: the model reads a registry that doesn't exist (found during a
  // walkthrough on 15/08/2026, where this was the hypothesis — reproduced on 16/08).
  //
  // This is the FORWARD counterpart of the `isRisky` guard on restitution, and it is bounded
  // three ways: the value must itself CARRY a dot (that's the signature of an acronym — without
  // it the guard caught « app » inside « app.notion.com », which the URL guard already handles, and
  // it would have left a short first name glued to a dot in clear); it must be SHORT
  // (≤3 characters excluding dots); and the neighbouring dot must be INTERNAL to the token, followed by a
  // letter or a digit — « le service R.C. » at the end of a sentence keeps its substitution.
  const bare = matched.replace(/\./g, "");
  const afterNext = text[start + matched.length + 1] ?? "";
  const dottedFragment =
    matched.includes(".") &&
    bare.length <= 3 &&
    (before === "." || (after === "." && /[\p{L}\p{N}]/u.test(afterNext)));
  return gluedBefore || gluedAfter || dottedFragment;
}

// The case-normalisation family (titleCase / recaseLike / needsRecase /
// hasAllCapsWord) lives in `./recase.ts` (300-LOC split) and is re-exported
// here so every existing `./util` import keeps working.
export { titleCase, recaseLike, hasAllCapsWord, needsRecase } from "./recase";

/** Canonical key for a named entity: lowercase + strip inter-token separators (space,
 *  `.`, `-`, `_`) so every spelling variant — "Karl Studio" / "Karl studio" /
 *  "karl-studio" / "KarlStudio" — collapses to ONE key ("karlstudio"), used to unify all
 *  variants to a SINGLE fake identity in the vault. */
export function entityKey(value: string): string {
  return value.toLowerCase().replace(/[\s._-]+/g, "");
}

/** A regex matching every spelling variant of a named entity in a haystack: its word
 *  tokens IN ORDER, separated by any run of space/`.`/`-`/`_` OR nothing (glued),
 *  case-insensitively, bounded to whole words (unicode-aware). Returns null for a value
 *  not safe to fuzzy-match — a LONE token < 4 chars, or any token carrying a digit —
 *  which would over-match generic short words. Fixed-literal-anchored ⇒ linear time,
 *  no catastrophic backtracking. */
export function entityVariantRegex(value: string): RegExp | null {
  const tokens = value.split(/[\s._-]+/).filter(Boolean);
  if (!tokens.length || tokens.some((t) => /\d/.test(t))) return null;
  if (tokens.length === 1 && tokens[0].length < 4) return null;
  const body = tokens.map(escapeRegExp).join("[\\s._-]*");
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, "giu");
}

/**
 * Every DISTINCT substring of `input` equal to `value` ignoring case, returned
 * with the text's REAL casing. So a name/city the model reported in normal case
 * ("Jean Morvan") still matches an UPPERCASE occurrence ("JEAN MORVAN") and we
 * redact the actual text. Falls back to an exact match when lowercasing would
 * shift indices (rare unicode), so the slices never misalign.
 */
export function caseInsensitiveOccurrences(input: string, value: string): string[] {
  const hay = input.toLowerCase();
  const needle = value.toLowerCase();
  if (hay.length !== input.length || needle.length !== value.length) {
    return input.includes(value) ? [value] : [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) {
    const actual = input.slice(i, i + value.length);
    // Only WHOLE-WORD occurrences: a model that flags "us"/"ca" must not match the
    // substring inside "plus"/"vous"/"Canva" (unicode-aware, keeps accents intact).
    // EXEMPT CJK: Chinese/Japanese are written WITHOUT spaces, so every CJK entity is
    // "glued" to its neighbours — the word-glue guard would drop every zh/ja name
    // ("张伟" between 户/先). CJK has no subword ambiguity, so a CJK value is always
    // standalone. (Korean is spaced, so it already passed — this rescues zh/ja.)
    if (!isCjkText(actual) && isWordGlued(input, i, actual)) continue;
    if (!seen.has(actual)) {
      seen.add(actual);
      out.push(actual);
    }
  }
  return out;
}

/** Every DISTINCT whole-word substring of `input` that is a spelling variant of `value`
 *  — casing, spacing, hyphen/underscore, or glued — with the text's REAL characters.
 *  A superset of {@link caseInsensitiveOccurrences}, onto which it FALLS BACK when the
 *  value can't be safely fuzzy-matched.
 *
 *  ⚠️ This fallback used to be `input.includes(value)`, so it was CASE-SENSITIVE — and it is
 *  the ONLY path for values `entityVariantRegex` refuses: those carrying a
 *  DIGIT (« ACME2024 », « Projet A7 ») and isolated words under 4 letters
 *  (« IBM »). Yet the Vault promises "always redacted": a term entered as « ACME2024 »
 *  wasn't recognised when written « acme2024 », which caused the fail-closed
 *  escalation of the browser's clear mode (`agent/navClearRedact.ts`) to be missed — the page
 *  reached the model with the Vault's value in CLEAR. */
export function variantOccurrences(input: string, value: string): string[] {
  const re = entityVariantRegex(value);
  if (!re) return caseInsensitiveOccurrences(input, value);
  const out: string[] = [];
  const seen = new Set<string>();
  for (let m = re.exec(input); m; m = re.exec(input)) {
    const actual = m[0];
    if (!isWordGlued(input, m.index, actual) && !seen.has(actual)) {
      seen.add(actual);
      out.push(actual);
    }
    if (m.index === re.lastIndex) re.lastIndex++; // guard against a zero-width match
  }
  return out;
}

/**
 * True when the text contains a CJK script character (Han / Hiragana / Katakana /
 * Hangul). A CJK glyph is a whole morpheme, not a subword — so a 2-char CJK span
 * ("张伟", "김민준") is a FULL name, unlike a 2-char Latin fragment ("IE"), and must
 * be exempt from Latin-tuned min-length filters. Same `\p{sc=…}` idiom as `geoBlocks`.
 */
export function isCjkText(text: string): boolean {
  return /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]/u.test(text);
}
