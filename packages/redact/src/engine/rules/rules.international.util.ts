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
  // ⚠️ ET LE MÊME PIÈGE EN TÊTE, une case plus loin. Le `\b` de tête tenait sur une
  // hypothèse — « tous les mots de contexte commencent par une lettre ASCII » — qui est
  // FAUSSE depuis que le vocabulaire porte des mots CJK. Mesuré le 16/08/2026 (banc des
  // personas hors de France) sur un vrai numéro : « My Number 8465 2198 7037 » est
  // redacted, « マイナンバー 8465 2198 7037 » et « 個人番号 … » partent EN CLAIR — un
  // numéro national japonais, sur son étiquette japonaise. Aucun `\b` n'existe devant un
  // idéogramme, donc AUCUNE règle gardée par un mot CJK ne pouvait jamais tirer.
  //
  // `(?<![A-Za-z0-9_])` dit la même chose que `\b` pour un mot-clé à initiale ASCII (le
  // mot commence par une lettre, donc `\b` s'y réduit à « le précédent n'est pas un
  // caractère de mot ») et laisse le CJK passer. La protection d'origine — qu'un SUFFIXE
  // de mot ne serve pas de garde — est donc conservée telle quelle.
  const HEAD = `(?<![A-Za-z0-9_])`;
  //
  // The separator run carries `n`/`N`/`°`/`º` for the "N°" idiom — and `o`/`O` for its
  // ASCII rendering "No:", which is what an OCR (and most keyboards) produce. Without
  // it the gate stopped dead on "CARTE NATIONALE D'IDENTITÉ No: 1403…", the exact
  // separator a French identity document prints.
  // La VIRGULE en fait partie parce que le libellé administratif la porte : « Immatriculation
  // au RCS, numéro … ». Sans elle la course de séparateurs s'arrêtait net après le mot-clé,
  // et le gate ne démarrait même pas (Kbis réel, 15/08/2026). Elle ne peut pas enjamber une
  // autre valeur : ce qui suit doit rester séparateurs et mots courts.
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
  // ⚠️ Les bornes BASSES commencent où la branche précédente s'arrête (16 après `S{1,15}`,
  // 7 après le `S{1,6}` du filler) : une gouttière courte est DÉJÀ couverte, et laisser les
  // deux branches se recouvrir doublait le coût du lookbehind sur les colonnes de nombres
  // (mesuré : 0,47 → 1,02 ms par passe et par règle sur 30 Ko de relevé ; disjointes,
  // 0,47 → 0,53). Le gain de détection est identique — seules les largeurs >15 manquaient.
  const GUTTER = `[ \\t\\u00A0\\u202F]`;
  const FILLER = `(?:[a-zà-öø-ÿ]{1,15}(?:${S}{1,6}|${GUTTER}{7,60})){0,5}`;
  // GOUTTIÈRE DE COLONNE — l'idiome des documents administratifs, que la fenêtre ci-dessus
  // ne pouvait pas franchir. Sur un Kbis réel (15/08/2026), « Immatriculation au RCS,
  // numéro » et sa valeur sont alignés en colonnes : ~18 espaces les séparent, donc >15, et
  // le SIREN du domiciliataire partait EN CLAIR — celui de la société n'étant sauvé que par
  // le « R.C.S. » qui le SUIT. Un SIREN se convertit en raison sociale par une recherche au
  // registre public : masquer le nom et laisser le numéro ne masque rien.
  //
  // Élargir `S{1,15}` aurait coûté la barre de précision (un séparateur quelconque peut
  // enjamber une AUTRE valeur). Une gouttière d'espaces PURS, elle, ne le peut pas : s'il y
  // avait quoi que ce soit entre le libellé et le nombre, la course d'espaces serait rompue.
  // Sans saut de ligne (le cas vertical est à `labelBlocks.ts`), et bornée à une largeur de
  // colonne. Épinglé dans `rules.gateGutter.test.ts`.
  // MOT COLLÉ — l'OCR soude le mot-clé au mot suivant. Mesuré le 16/08/2026 sur un PV réel :
  // « RCS Créteil 701 452 006 » est extrait « RCSCréteil 701 452 006 », et le SIREN partait
  // EN CLAIR là où la même ligne espacée le redacted. Un SIREN se convertit en raison
  // sociale par une recherche au registre public — le laisser, c'est ne rien masquer.
  //
  // ⚠️ Ce n'est PAS un `S{0,15}` devant le FILLER, essayé d'abord : cette forme recouvre la
  // 4ᵉ branche, et le commentaire de la gouttière dit pourquoi c'est interdit — le banc sur
  // documents réels est passé de ~1 min à >10 min, sur les mêmes colonnes de nombres. Une
  // branche DISJOINTE ne coûte rien : elle exige ≥1 LETTRE juste après le mot-clé, là où la
  // 1ʳᵉ exige ≥1 séparateur et la 4ᵉ n'admet aucune lettre — aucune position ne peut
  // satisfaire deux branches. UN seul mot collé, puis de vrais séparateurs : au-delà, ce
  // n'est plus une soudure d'OCR mais une phrase, et l'autorité du mot-clé s'y arrêterait.
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
