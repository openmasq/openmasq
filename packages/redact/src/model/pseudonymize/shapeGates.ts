/**
 * Two SHAPE gates on a free-form candidate (a name, an organisation), both measured on a
 * coding agent's system prompt going through the proxy:
 *
 *   « ` slug. Link liberally »     tagged NAME — a backtick and a sentence boundary inside
 *                                  a person's name, then faked to « ` guilbaud. Fressineau »;
 *   « slug. Link liberally »       the same span once the backtick fell outside it.
 *
 * A NER reads Markdown as prose and hands back spans that no name or company ever takes:
 * they cost a substitute the model has to reason around, a row in the journal, and nothing
 * was protected. The gates are NARROW on purpose — a character that cannot occur in a name,
 * a sentence boundary inside the span — so a real « Saint-Étienne », « J. R. R. Tolkien »
 * or « Acme Inc. » passes untouched.
 *
 * ⚠️ NOT a gate: a kebab/snake identifier (« path-cleaning-rules », tagged ORG). Tempting, and
 * wrong — `camille-roussel` is the URL slug of a person, and the engine's variant machinery
 * relies on that candidate to keep ONE identity across a name's spellings
 * (`index.test.ts`, « SEPARATOR-joined name »). Dropping the shape drops the slug in clear.
 */

/** Characters no person's or organisation's name carries: a backtick, brackets, a pipe, a
 *  line break. */
const NEVER_IN_A_NAME = /[`<>{}[\]|\n]/;

/** A sentence boundary INSIDE the span: a lowercase word, a full stop, a space, more text
 *  (« slug. Link liberally »). Narrow on purpose — an initial (« J. R. R. Tolkien »), an
 *  abbreviation (« St. Louis », « Mr. Smith ») and a trailing « Inc. » all keep their period. */
const SENTENCE_INSIDE = /[a-zà-ÿ]{2,}\. \S/;

/** True when the span cannot be a name or an organisation by its shape alone. */
export function isMalformedEntity(value: string): boolean {
  const v = value.trim();
  return NEVER_IN_A_NAME.test(v) || SENTENCE_INSIDE.test(v);
}
