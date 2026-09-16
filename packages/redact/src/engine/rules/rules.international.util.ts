// Shared helper for the rule sets. A bare numeric scheme with no checksum is FAR too
// common to redact on shape alone, so it fires only when one of the scheme's CONTEXT words
// sits just before it. Distinctive-shape or checksum-validated schemes skip this.

/** Make every literal space in a context phrase tolerant to OCR word-GLUING ("CARTENATIONALE
 *  D'IDENTITÉ"): a space becomes "zero or more whitespace". It cannot widen the gate — the
 *  words still appear in order, adjacent. Spaces INSIDE a character class are left alone. */
function ocrTolerantWords(words: string): string {
  let out = "";
  let inClass = false;
  for (let i = 0; i < words.length; i++) {
    const c = words[i];
    if (c === "\\") { out += c + (words[i + 1] ?? ""); i++; continue; }
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    out += c === " " && !inClass ? "\\s*" : c;
  }
  return out;
}

/** A gated pattern carries a cheap PRESENCE PROBE for its keywords: the lookbehind is
 *  evaluated at EVERY position a digit-startable core can begin, which on a statement's
 *  number columns is expensive. A rule whose keyword appears NOWHERE is skipped outright.
 *  Both harness loops (engine/redact.ts, model/pseudonymize/gather.ts) honour it — a NEW
 *  consumer of RULES should too. */
export interface GatedPattern extends RegExp {
  probe?: RegExp;
}

export function gate(words: string, core: string): GatedPattern {
  // No trailing \b after the context word: JS \b is ASCII-only, so a word ending in an
  // ACCENTED letter ("identité") never finds a boundary. It is redundant anyway — the
  // separator class and the core both exclude letters, so a longer word can't chain in.
  // The HEAD is `(?<![A-Za-z0-9_])`, not `\b`: no `\b` exists before an ideograph, so a
  // leading `\b` would let NO rule gated by a CJK word (« マイナンバー ») ever fire. For an
  // ASCII-initial keyword it says the same thing, so a word SUFFIX still never acts as a gate.
  const HEAD = `(?<![A-Za-z0-9_])`;
  // The separator run carries `n`/`N`/`°`/`º` for the "N°" idiom and `o`/`O` for its ASCII
  // rendering "No:" (what an OCR produces), and the COMMA of administrative wording
  // (« Immatriculation au RCS, numéro … »). It can't reach across another value: what
  // follows must stay separators and short words.
  const S = `[\\s:.#=nNoO°º'",\\-]`;
  // LINKING WORDS: « le passeport du titulaire porte le numéro 12AB34567 » is how a CHAT
  // phrases it; the keyword-adjacent form is the DOCUMENT idiom. After at least ONE
  // separator, up to five short LETTER-ONLY words (≤15 letters) may sit between keyword and
  // value — a digit run can't be bridged over, so the keyword's authority never crosses a
  // clause. Pinned in rules.gateFillers.test.ts.
  // ⚠️ The LOW bounds start where the previous branch stops (16 after `S{1,15}`, 7 after
  // the filler's `S{1,6}`): overlapping branches double the lookbehind's cost on number
  // columns for no detection gain.
  const GUTTER = `[ \\t\\u00A0\\u202F]`;
  const FILLER = `(?:[a-zà-öø-ÿ]{1,15}(?:${S}{1,6}|${GUTTER}{7,60})){0,5}`;
  // COLUMN GUTTER — administrative documents column-align label and value (~18 spaces on a
  // Kbis). Widening `S{1,15}` would cost the precision bar (any separator can reach across
  // ANOTHER value); a gutter of PURE spaces cannot — anything between label and number
  // breaks the run. No line break (the vertical case belongs to `labelBlocks.ts`), bounded to
  // one column width. Pinned in `rules.gateGutter.test.ts`.
  // GLUED WORD — OCR fuses the keyword to the following word (« RCSCréteil 701 452 006 »).
  // ⚠️ NOT an `S{0,15}` in front of the FILLER: that overlaps the gutter branch and makes
  // the bench on real documents time out. A DISJOINT branch costs nothing: it requires ≥1
  // LETTER right after the keyword, where the 1st requires ≥1 separator and the 4th admits
  // no letter. ONE glued word only: beyond that it's a sentence, not OCR fusion.
  const GLUED = `[a-zà-öø-ÿ]{1,15}${S}{1,6}`;
  const re: GatedPattern = new RegExp(
    `(?<=${HEAD}(?:${ocrTolerantWords(words)})(?:${S}{1,15}${FILLER}|${GLUED}|${GUTTER}{16,60}|${S}{0,15}))(?:${core})`,
    "gi",
  );
  // No "g": a presence test only — `probe.test` must not carry `lastIndex` state.
  re.probe = new RegExp(`${HEAD}(?:${ocrTolerantWords(words)})`, "i");
  return re;
}

/** A plain global rule from a presidio pattern string (distinctive shapes). */
export function re(core: string, flags = "g"): RegExp {
  return new RegExp(core, flags);
}

/** A mid-value LINE WRAP for a spaced scheme's separator alternation: one newline plus the
 *  next line's indent (a hard-wrapped paste, a narrow PDF column). `[ ]?` becomes
 *  `(?:[ ]|${WRAP})?`. */
export const WRAP = String.raw`\r?\n[ \t]*`;

/** The intra-number SPACE class for spaced schemes: plain space PLUS the no-break (U+00A0)
 *  and narrow no-break (U+202F) spaces — French typographic digit-group separators, which
 *  PDF extraction emits verbatim. Validators strip `\D` or `\s`, which covers both. */
export const SP = "[ \u00A0\u202F]";

/** FP guard of every WRAP-tolerant rule: at most ONE line break per candidate. 2+ newlines
 *  is a COLUMN of unrelated numbers fused vertically, rejected BEFORE the checksum can
 *  bless it (Luhn passes ~1/10 of random digit runs). */
export const maxOneWrap = (m: string): boolean => (m.match(/\n/g) ?? []).length <= 1;
