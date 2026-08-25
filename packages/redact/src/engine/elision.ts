/**
 * Repairing FRENCH ELISION around a restored value.
 *
 * The model writes correct French around the FAKE it was given. Substituting the real value
 * back can then break the article, and the user reads the damage: a fake starting with a
 * vowel (« Ostrel ») gives « à la tête d'Ostrel », and restoring a consonant-initial real
 * value produces **« à la tête d'Karl Studio »**. The reverse happens too — a
 * consonant-initial fake gives « de Kelby », and a vowel-initial real value should read
 * « d'Ambrell ».
 *
 * This is not cosmetic. The product's promise is that the user sees THEIR data restored;
 * mangled French around it makes the restoration look like a machine artefact — which is
 * exactly what it is supposed to hide.
 *
 * ⚠️ Only applied on the DISPLAY leg (fake → real). The outbound leg is what the model
 * reads; rewriting it would shift offsets the reverse pass depends on, to fix grammar for
 * a reader that isn't human.
 */

/** Elided forms whose expansion is UNAMBIGUOUS. `l'` is deliberately absent: expanding it
 *  needs the gender (« le »/« la »), and guessing wrong is worse than leaving it. */
const EXPANDS: Record<string, string> = {
  d: "de",
  qu: "que",
  n: "ne",
  s: "se",
  j: "je",
  m: "me",
  t: "te",
  c: "ce",
};

/** Words that elide before a vowel. `le`/`la` both give `l'`, so contracting them is safe
 *  even though expanding `l'` is not — the ambiguity only runs one way. */
const CONTRACTS = ["de", "que", "ne", "se", "je", "me", "te", "ce", "le", "la"];

/** Does this value START with a vowel sound, for elision purposes? `h` counts as a
 *  consonant: « de Hachette » is always acceptable, « d'H… » only sometimes. */
export function startsWithVowelSound(value: string): boolean {
  return /^[aeiouyàâäéèêëîïôöùûü]/i.test(value.trim());
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * ⚠️ L'EMPHASE MARKDOWN s'intercale entre l'article et la valeur, et c'est le cas COURANT,
 * pas le cas limite : le modèle met les noms en gras dans ses réponses. Mesuré le
 * 16/08/2026 — « à la tête d'**Karl Studio** » n'était pas réparé alors que la même phrase
 * sans gras l'était, donc la réparation ne servait précisément pas là où on la lit.
 *
 * Les marqueurs sont CAPTURÉS et ré-émis verbatim : la réparation touche l'article, jamais
 * le balisage. Ouvrants seulement (`**`/`_`/`*` avant la valeur) — le marqueur fermant est
 * après la valeur, hors du motif, donc rien à recoller.
 */
const EMPH = `(\\*{1,3}|_{1,3})?`;

/**
 * Fix the elision immediately before each occurrence of `value` in `text`.
 *
 * Surgical by construction: the pattern is anchored on the value itself, so nothing else in
 * the sentence can be rewritten. Case is preserved on the article (« De » stays capitalised).
 */
export function fixElisionAround(text: string, value: string): string {
  const v = value.trim();
  if (!v) return text;
  const lit = escape(v);
  let out = text;

  if (startsWithVowelSound(v)) {
    // « de Ambrell » → « d'Ambrell ». The apostrophe matches the typographic one the rest
    // of the product uses.
    const re = new RegExp(`\\b(${CONTRACTS.join("|")})(\\s+)${EMPH}(${lit})`, "gi");
    out = out.replace(re, (_m, word: string, _sp: string, emph = "", val: string) => {
      const stem = word.length > 2 ? word.slice(0, -1) : word[0];
      const cased = word[0] === word[0].toUpperCase() ? stem[0].toUpperCase() + stem.slice(1) : stem;
      return `${cased}'${emph}${val}`;
    });
    return out;
  }

  // Consonant-initial: « d'Karl Studio » → « de Karl Studio ».
  const re = new RegExp(`\\b(${Object.keys(EXPANDS).join("|")})['’]${EMPH}(${lit})`, "gi");
  return out.replace(re, (_m, word: string, emph = "", val: string) => {
    const full = EXPANDS[word.toLowerCase()];
    if (!full) return `${word}'${emph}${val}`;
    const cased = word[0] === word[0].toUpperCase() ? full[0].toUpperCase() + full.slice(1) : full;
    return `${cased} ${emph}${val}`;
  });
}

/** Repair elision around every restored value. Values are applied longest-first so a
 *  fragment never rewrites inside a longer one that was also restored. */
export function fixElisions(text: string, values: Iterable<string>): string {
  const sorted = [...new Set([...values].map((v) => v.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  let out = text;
  for (const v of sorted) out = fixElisionAround(out, v);
  return out;
}
