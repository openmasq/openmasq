// ── Case normalisation ──────────────────────────────────────────────────────
// Cased detectors (a BERT NER, and a small instruct model) badly UNDER-detect
// entities written in ALL-CAPS (admin forms, addresses, scanned docs) — a lone
// uppercase name/city ("PARIS") slips through even though the prompt asks for it.
// Callers feed a title-cased variant and locate the hits back in the ORIGINAL
// text (case-insensitively) so the value keeps its real casing (verbatim,
// redactable). Shared by the model detector (`model/detect.ts`) and the local
// NER (`local/ner.ts`) so the two never drift. Split out of `util.ts` (300-LOC
// cap); everything is re-exported there so import paths are unchanged.

/** Apostrophe prefixes whose elided tail is a PROPER-NOUN slot ("d'Avignon",
 *  "l'Hôtel", "o'Brien", "dell'Aquila") — the tail gets its own capital so a
 *  cased NER sees the entity. VERB elisions (m'/j'/s'/c'/n'/t'/qu') stay lower:
 *  "M'Appelle" reads name-like and measurably CONFUSES the model (a real name
 *  right after it was lost). */
const NOUN_ELISION = /^(?:l|d|o|[a-z]*ll)$/i;

/** Title-case every word: "JEAN MORVAN" → "Jean Morvan", "PARIS" → "Paris".
 *  Sub-words after a HYPHEN get their own capital when ≥2 letters ("saint-brieuc"
 *  → "Saint-Brieuc") — a cased NER wants the capital on each sub-word. After an
 *  APOSTROPHE only a noun-elision prefix qualifies (see {@link NOUN_ELISION}):
 *  "d'avignon" → "D'Avignon" but "m'appelle" → "M'appelle", and a possessive/
 *  contraction tail keeps its shape ("john's" → "John's", "don't" → "Don't"). */
export function titleCase(text: string): string {
  return text.replace(/\p{L}[\p{L}'’-]*/gu, (w) => {
    const parts = w.split(/(['’-])/u);
    return parts
      .map((part, i) => {
        if (i % 2 === 1 || !part) return part; // the separator itself
        const afterApostrophe = i > 0 && /['’]/.test(parts[i - 1]);
        const cap =
          i === 0 ||
          (part.length >= 2 && (!afterApostrophe || NOUN_ELISION.test(parts[i - 2] ?? "")));
        return cap ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part.toLowerCase();
      })
      .join("");
  });
}

/**
 * Re-shape `fake` to match `real`'s per-word casing AND separator layout, so a fake
 * reused for a DIFFERENT spelling of the same value reads as ONE identity: the fake
 * "Oslen Group" (issued for "Karl Studio") becomes "Oslen group" for "Karl studio",
 * "OSLEN GROUP" for "KARL STUDIO", "oslen-group" for "karl-studio", "OslenGroup" for
 * the glued "KarlStudio". Each fake word takes its aligned real word's casing (all-lower
 * → lower, ALL-CAPS → upper, else the fake's own casing) and the fake is re-joined with
 * the REAL's separators (space / `.` / `-` / `_` / none-when-glued). A single-token,
 * single-case real (a URL host / handle: "francetravail") gets the fake GLUED —
 * "ashbornegroup" — since a spaced fake inside a hostname ships a broken URL. When the
 * word counts otherwise differ (an odd fake/real pairing) it falls back to a
 * whitespace-only recase that keeps the fake's own layout, so it never mangles the fake.
 */
export function recaseLike(fake: string, real: string): string {
  const fakeWords = fake.split(/[\s._-]+/).filter(Boolean);
  const realTokens = splitEntityTokens(real);
  // A single-token, single-case real is a GLUED spelling with no camel boundary to
  // split on — a URL host or a handle ("francetravail" for "France Travail"). The
  // fake must be glued too: a spaced fake substituted into a hostname breaks the
  // URL the model then navigates ("https://candidat.ashborne Group.fr/…").
  if (realTokens.length === 1 && fakeWords.length > 1) {
    const word = realTokens[0].word;
    if (word === word.toLowerCase() || word === word.toUpperCase()) {
      return recaseToken(fakeWords.join(""), word) + realTokens[0].sep;
    }
  }
  if (fakeWords.length !== realTokens.length || fakeWords.length === 0) {
    return recaseWordsOnly(fake, real);
  }
  return realTokens.map((t, i) => recaseToken(fakeWords[i], t.word) + t.sep).join("");
}

/** Apply `realWord`'s casing to `fakeWord` (all-lower / ALL-CAPS / else keep fake). */
function recaseToken(fakeWord: string, realWord: string): string {
  if (!/\p{L}/u.test(fakeWord)) return fakeWord;
  if (realWord === realWord.toLowerCase()) return fakeWord.toLowerCase();
  if (realWord.length > 1 && realWord === realWord.toUpperCase()) return fakeWord.toUpperCase();
  return fakeWord; // title / mixed → keep the fake's casing
}

/** Split a value into words + the separator FOLLOWING each, treating a run of
 *  space/`.`/`-`/`_` AND a camelCase lower→upper boundary (glue) as a word break
 *  (`sep:""` for a glued break). "karl-studio" → [{karl,"-"},{studio,""}];
 *  "KarlStudio" → [{Karl,""},{Studio,""}]. */
function splitEntityTokens(value: string): { word: string; sep: string }[] {
  const words: { word: string; sep: string }[] = [];
  const parts = value.split(/([\s._-]+)/); // [chunk, sep, chunk, sep, …]
  for (let i = 0; i < parts.length; i += 2) {
    const chunk = parts[i];
    const sepAfter = parts[i + 1] ?? "";
    if (!chunk) {
      if (sepAfter && words.length) words[words.length - 1].sep += sepAfter;
      continue;
    }
    const sub = chunk.split(/(?<=\p{Ll})(?=\p{Lu})/u); // camelCase → glued sub-words
    sub.forEach((w, j) => words.push({ word: w, sep: j < sub.length - 1 ? "" : sepAfter }));
  }
  return words;
}

/** The pre-existing whitespace-only recase (kept as the token-count-mismatch fallback). */
function recaseWordsOnly(fake: string, real: string): string {
  const fw = fake.split(/(\s+)/);
  const rw = real.split(/(\s+)/);
  return fw
    .map((tok, i) => {
      if (i % 2 === 1 || !/[A-Za-zÀ-ÿ]/.test(tok)) return tok;
      const r = rw[i];
      if (!r) return tok;
      if (r === r.toLowerCase()) return tok.toLowerCase();
      if (r.length > 1 && r === r.toUpperCase()) return tok.toUpperCase();
      return tok;
    })
    .join("");
}

/** True when the text has ≥1 ALL-CAPS word of ≥3 letters ("PARIS", "JEAN") — a
 *  cased detector under-detects those, so callers ALSO run a title-cased pass.
 *  ≥3 letters skips 2-letter tokens ("US", "OK") that are rarely PII. */
export function hasAllCapsWord(text: string): boolean {
  return /\p{Lu}[\p{Lu}'’-]{2,}/u.test(text);
}

/** Space / opening punctuation a sentence capital may sit behind — walked over
 *  when testing whether a capital is sentence-INITIAL. */
const SENTENCE_OPENERS = /[ \t"'«»“”‘’()[\]{}\-–—•·*>]/;

/** True when the letter at `idx` merely OPENS a sentence, line or list item — the
 *  conventional capital of "Je suis…", not evidence the text is deliberately cased.
 *  Walks back over spaces/quotes/brackets/bullets; a line start, the text start or a
 *  sentence-ender (`.!?…:;`) before it qualifies. */
function isSentenceInitial(text: string, idx: number): boolean {
  for (let i = idx - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === "\n" || ch === "\r") return true;
    if (SENTENCE_OPENERS.test(ch)) continue;
    return /[.!?…:;]/.test(ch);
  }
  return true;
}

/**
 * True when the text isn't in "proper" case, so a CASED detector under-detects
 * it and a title-cased second pass helps:
 *  - ≥1 ALL-CAPS word (admin form / address block / a lone uppercase name/city), OR
 *  - multi-word text with essentially NO uppercase (casual all-lowercase typing).
 * Well-cased prose ("Je m'appelle Jean…") trips neither → single pass.
 * (The caps threshold is ≥1 — a LONE uppercase city like "PARIS" must trigger it;
 * the old ≥2 missed it.)
 *
 * Sentence-INITIAL capitals are excluded from the ratio: "Je suis augustin vaudel" is
 * lowercase typing with one conventional capital, and counting the "J" (1/16 ≈ 6% >
 * the 3% floor) suppressed the recase pass — the cased NER then missed the lowercase
 * name entirely. Only a MID-sentence capital ("…appelle Jean…") is evidence the
 * author cases their proper nouns.
 */
export function needsRecase(text: string): boolean {
  if (hasAllCapsWord(text)) return true;
  let upper = 0;
  let letters = 0;
  let words = 0;
  for (const m of text.matchAll(/\p{L}[\p{L}'’-]*/gu)) {
    words += 1;
    const w = m[0];
    for (let i = 0; i < w.length; i++) {
      const ch = w[i];
      if (!/\p{L}/u.test(ch)) continue;
      letters += 1;
      if (ch !== ch.toUpperCase() || ch === ch.toLowerCase()) continue;
      if (i === 0 && isSentenceInitial(text, m.index)) continue;
      upper += 1;
    }
  }
  return words >= 3 && letters >= 8 && upper / letters < 0.03;
}
