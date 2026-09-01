/**
 * The shape TEMPLATE of a redacted value — tier B of the « sans mapping » export:
 * where the export removes the redacted→original pair, it shows instead the SHAPE of
 * the original (case, digits, separators, length), computed locally. That's what
 * lets you diagnose "the IBAN detector missed an IBAN with non-breaking spaces" without
 * ever seeing the IBAN.
 *
 * What may go out / what never does:
 *  - goes out: X (uppercase), x (lowercase), ◌ (caseless letter — CJK…), 9 (digit),
 *    separators/punctuation VERBATIM (the structure, not the content), the length.
 *  - never goes out: a character of the value itself; and for a secret/key-type
 *    value, EVEN the structure is overwritten (`••• (N car.)`) — the layout of a
 *    password's symbols is already a clue.
 *
 * Accepted residual (stated here, shown to the user before send): a template reveals
 * length + layout — enough to tell "gmail.com" from "outlook.com" by
 * length, never enough to reconstruct a value.
 */

/** Categories whose very STRUCTURE doesn't go out (a secret has no safe "shape"). */
const OPAQUE_LABELS = new Set(["secret", "apikey", "password", "token"]);

const MAX_SHAPE = 48;

/** A value's raw template (without the secrets' opacity rule). */
export function valueShape(value: string): string {
  let out = "";
  for (const ch of value) {
    if (/\p{Lu}/u.test(ch)) out += "X";
    else if (/\p{Ll}/u.test(ch)) out += "x";
    else if (/\p{N}/u.test(ch)) out += "9";
    else if (/\p{L}/u.test(ch)) out += "◌"; // caseless letter (CJK, kana…)
    else if (/\s/u.test(ch)) out += " "; // any whitespace (NBSP included) → a plain space
    else out += ch; // separator / punctuation: the structure, never the content
    if (out.length >= MAX_SHAPE) return `${out}… (${[...value].length} car.)`;
  }
  return out;
}

/** The template to export for a log pair, according to its category. */
export function valueShapeFor(value: string, label?: string): string {
  if (!value) return "∅";
  if (label && OPAQUE_LABELS.has(label.toLowerCase())) return `••• (${[...value].length} car.)`;
  return valueShape(value);
}
