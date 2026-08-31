// Shared helper for the international rule sets. A bare numeric scheme (a plain
// `\d{9}` / `\d{11}` with no checksum) is FAR too common to redact on shape
// alone, so — mirroring how the built-in rules gate SIREN/EIN/BIC — we only fire
// it when one of the scheme's CONTEXT words (from presidio's recognizer) sits
// just before it. Distinctive-shape or checksum-validated schemes skip this.

/**
 * Build a context-gated pattern: `core` only matches when preceded (within a
 * short separator run) by one of `words`. `words` is a `|`-alternation of the
 * presidio CONTEXT terms. Case-insensitive on the context; the core keeps its
 * own character classes. Always global.
 */
/** Make every literal space in a context phrase tolerant to OCR word-GLUING.
 *
 *  Measured on real scanned documents: docTR reads "CARTE NATIONALE D'IDENTITÉ" as
 *  "CARTENATIONALE D'IDENTITÉ", and the CNI gate — which is what turns 12 banal digits
 *  into an identity-document number — simply never fired. One missing space and the most
 *  sensitive value on the page left in clear.
 *
 *  So a space between two words becomes "zero or more whitespace". It cannot widen the
 *  gate onto anything else: the words still have to appear, in order, adjacent. Spaces
 *  INSIDE a character class are left alone (`p[oô]le[ -]?emploi` must keep its class). */
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

/** A gated pattern carries a cheap PRESENCE PROBE for its keywords. The gate's
 *  linking-words lookbehind is evaluated at EVERY position its digit-startable core
 *  can begin — on a statement's number columns that priced each gated rule at
 *  ~100 ms per document (measured on the acte-cautionnement fixture: 222 rules,
 *  ~2.5 s total). A rule whose keyword appears NOWHERE in the input can be skipped
 *  outright; the probe is one word-alternation test, false positives just run the
 *  rule. Both harness loops (engine/redact.ts, model/pseudonymize/gather.ts) honour
 *  it — a NEW consumer of RULES should too. */
export interface GatedPattern extends RegExp {
  probe?: RegExp;
}

export function gate(words: string, core: string): GatedPattern {
  // No trailing \b after the context word: JS \b is ASCII-only, so a word ending in an
  // ACCENTED letter ("identité", "identità") never found a boundary and the gate never
  // fired. The \b is redundant anyway — the separator class and the core both exclude
  // letters, so a longer word ("cnix…") can't chain into a match.
  //
  // ⚠️ AND THE SAME TRAP AT THE HEAD, one box further along. The leading `\b` rested on an
  // assumption — "every context word starts with an ASCII letter" — which is
  // FALSE now that the vocabulary carries CJK words. Measured on 16/08/2026 (the
  // outside-France persona bench) on a real number: « My Number 8465 2198 7037 » is
  // redacted, « マイナンバー 8465 2198 7037 » and « 個人番号 … » go out IN CLEAR — a
  // Japanese national number, on its Japanese label. No `\b` exists before an
  // ideograph, so NO rule gated by a CJK word could ever fire.
  //
  // `(?<![A-Za-z0-9_])` says the same thing as `\b` for an ASCII-initial keyword (the
  // word starts with a letter, so `\b` there reduces to "the preceding character isn't a
  // word character") and lets CJK through. The original protection — that a word
  // SUFFIX shouldn't act as a gate — is therefore kept unchanged.
  const HEAD = `(?<![A-Za-z0-9_])`;
  //
  // The separator run carries `n`/`N`/`°`/`º` for the "N°" idiom — and `o`/`O` for its
  // ASCII rendering "No:", which is what an OCR (and most keyboards) produce. Without
  // it the gate stopped dead on "CARTE NATIONALE D'IDENTITÉ No: 1403…", the exact
  // separator a French identity document prints.
  // The COMMA is part of it because administrative wording carries it: « Immatriculation
  // au RCS, numéro … ». Without it the separator run stopped dead right after the keyword,
  // and the gate wouldn't even start (real Kbis, 15/08/2026). It can't reach across
  // another value: what follows must stay separators and short words.
  const S = `[\\s:.#=nNoO°º'",\\-]`;
  // LINKING WORDS: « le passeport du titulaire porte le numéro 12AB34567 » is how a
  // CHAT phrases it, and the adversarial battery showed every gated family leaking on
  // exactly that turn — the keyword-adjacent form is the DOCUMENT idiom, not the
  // conversational one. So after at least ONE separator, up to five short words may sit
  // between keyword and value (the BIC rule pioneered this; here the words are
  // case-insensitive because gate() compiles "gi" — backtracking keeps a letter-headed
  // CORE reachable, so a filler can never swallow the value). Bounded on purpose:
  // words are LETTER-ONLY (a digit run can't be bridged over — the amount in « la CAF
  // a versé 1 200 € sur le compte 1234567 » still blocks the gate) and ≤5 of ≤15
  // letters, so the keyword's authority never crosses a clause. The zero-separator
  // branch stays as before (OCR-glued keyword). Pinned in rules.gateFillers.test.ts.
  // ⚠️ The LOW bounds start where the previous branch stops (16 after `S{1,15}`,
  // 7 after the filler's `S{1,6}`): a short gutter is ALREADY covered, and letting the
  // two branches overlap doubled the lookbehind's cost on number columns
  // (measured: 0.47 → 1.02 ms per pass and per rule on 30 KB of statement; disjoint,
  // 0.47 → 0.53). The detection gain is identical — only widths >15 were missing.
  const GUTTER = `[ \\t\\u00A0\\u202F]`;
  const FILLER = `(?:[a-zà-öø-ÿ]{1,15}(?:${S}{1,6}|${GUTTER}{7,60})){0,5}`;
  // COLUMN GUTTER — the idiom of administrative documents, which the window above
  // couldn't cross. On a real Kbis (15/08/2026), « Immatriculation au RCS,
  // numéro » and its value are column-aligned: ~18 spaces separate them, so >15, and
  // the domiciliary agent's SIREN went out IN CLEAR — the company's own being saved only by
  // the « R.C.S. » that FOLLOWS it. A SIREN converts to a company name via a
  // public-registry lookup: masking the name and leaving the number masks nothing.
  //
  // Widening `S{1,15}` would have cost the precision bar (any separator can
  // reach across ANOTHER value). A gutter of PURE spaces, however, cannot: if there
  // were anything at all between the label and the number, the space run would be broken.
  // No line break (the vertical case belongs to `labelBlocks.ts`), and bounded to one
  // column width. Pinned in `rules.gateGutter.test.ts`.
  // GLUED WORD — OCR fuses the keyword to the following word. Measured on 16/08/2026 on a real
  // report: « RCS Créteil 701 452 006 » is extracted as « RCSCréteil 701 452 006 », and the SIREN went out
  // IN CLEAR where the same spaced line redacts it. A SIREN converts to a company
  // name via a public-registry lookup — leaving it means masking nothing.
  //
  // ⚠️ This is NOT an `S{0,15}` in front of the FILLER, tried first: that form overlaps the
  // 4th branch, and the gutter comment says why that's forbidden — the bench on
  // real documents went from ~1 min to >10 min, on the same number columns. A
  // DISJOINT branch costs nothing: it requires ≥1 LETTER right after the keyword, where the
  // 1st requires ≥1 separator and the 4th admits no letter — no position can
  // satisfy two branches. ONE glued word only, then real separators: beyond that, it's
  // no longer OCR fusion but a sentence, and the keyword's authority would stop there.
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

/** A mid-value LINE WRAP, usable inside a spaced scheme's separator alternation:
 *  one newline plus the next line's indent. Covers the two real sources of a value
 *  broken in its middle — text pasted from an email/terminal (hard-wrap at 72-80
 *  cols, the newline REPLACES the space) and a value wrapping inside a narrow
 *  PDF/table column (the 2D grid re-indents the continuation line). A separator
 *  class like `[ ]?` becomes `(?:[ ]|${WRAP})?`. */
export const WRAP = String.raw`\r?\n[ \t]*`;

/** The intra-number SPACE class for spaced schemes (card/IBAN/SIRET/NIR/VAT):
 *  plain space PLUS the no-break (U+00A0) and narrow no-break (U+202F) spaces —
 *  the standard French typographic digit-group separators, which PDF extraction
 *  emits verbatim. A rule matching only `[ ]` shipped every NBSP-grouped number
 *  in CLEAR. Validators are unaffected (they strip `\D` or `\s`, which covers both). */
export const SP = "[ \u00A0\u202F]";

/** FP guard composed into every WRAP-tolerant rule's validator: at most ONE line
 *  break per candidate. A genuinely wrapped value breaks exactly once; 2+ newlines
 *  means a COLUMN of unrelated numbers fused vertically (a financial table), which
 *  must be rejected BEFORE the checksum can bless it — Luhn passes ~1/10 of random
 *  digit runs, so the checksum alone is not a sufficient gate against fusion. */
export const maxOneWrap = (m: string): boolean => (m.match(/\n/g) ?? []).length <= 1;
