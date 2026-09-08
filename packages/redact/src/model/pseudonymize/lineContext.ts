import type { Detection } from "../../types";
import { redactionCategory } from "../../kinds";

/**
 * Two gates that read the LINE a candidate sits on, not its value — the same family as
 * `textContext.ts`, and the same discipline: FP-prevention only, a narrow positive pattern,
 * the candidate kept whenever the evidence is absent.
 *
 *   `**Loan Details**`   `### Loan`   `V. Endorsements`   `LICENSE GRANT` → a HEADING
 *   `:20:OTCUS33GXXX0560000012…`  `:32A:150523CAD1234567890…`            → a SWIFT field
 *
 * Measured 2026-09-07 on Nemotron-PII and Gretel (`bench/spans/`): the NER reads a
 * section title as an organisation, and the high-entropy credential rule reads the tagged
 * fields of an MT940 / MT103 message as keys — a third of the characters the product marked
 * on Gretel's bank messages were those. Occurrence-safe: a value is dropped only when EVERY
 * line it appears on is such a line, so « Loan » named in the body keeps its candidate.
 */

const ENTITY = new Set(["name", "company", "location"]);
const HIGH_ENTROPY = new Set(["apikey", "secret"]);

/** A markdown heading, a whole-line bold, or a numbered section title made of words only
 *  (« 1. Social Security Number (SSN) 054-24-0990 » carries a value and is not one). */
export function isHeadingLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 80) return false;
  if (/^#{1,6}\s/u.test(t)) return true;
  if (/^(?:\*\*|__)[^*_]+(?:\*\*|__):?$/u.test(t)) return true;
  return /^(?:[IVX]{1,5}|\d{1,2})[.)]\s+\p{Lu}[\p{L} &'’-]{1,50}$/u.test(t);
}

/**
 * A SWIFT MT field whose payload STARTS with this token — `:20:OTCUS33GXXX0560000012`,
 * `:32A:150523CAD1234567890ABCDEF`. The tag's own head is the message's machinery: a value
 * date, a currency, an amount, a reference, concatenated with no separator, which the
 * high-entropy rule reads as one key.
 *
 * ⚠️ The gate is ANCHORED at the tag on purpose, and that boundary is the whole safety of it:
 * what sits DEEPER in the payload, after the `/…/` delimiters, is where the message carries
 * PEOPLE — « :70:/NST/STANLEY JAMES-MARSH/SE/QH56771472 » is a driver's licence, and dropping
 * the whole line's tokens sent it in clear. Only the head is machinery; the rest is data.
 */
function isSwiftFieldHead(line: string, column: number): boolean {
  const tag = /^\s*:\d{2}[A-Z]?:/u.exec(line);
  return !!tag && column === tag[0].length;
}

/** Every occurrence of `value` in `input`, as its line and its column within that line. */
function occurrences(value: string, input: string): { line: string; column: number }[] {
  const out: { line: string; column: number }[] = [];
  let at = input.indexOf(value);
  while (at !== -1) {
    const start = input.lastIndexOf("\n", at) + 1;
    const end = input.indexOf("\n", at);
    out.push({ line: input.slice(start, end === -1 ? input.length : end), column: at - start });
    at = input.indexOf(value, at + value.length);
  }
  return out;
}

/** Drop the candidates every occurrence of which is a heading (entities) or the head of a
 *  SWIFT field's payload (high-entropy tokens). A `forced` candidate is never dropped. */
export function dropLineNoise(candidates: Detection[], input: string): Detection[] {
  return candidates.filter((c) => {
    if (c.forced) return true;
    const cat = redactionCategory(c.category);
    const noise = ENTITY.has(cat)
      ? (o: { line: string }) => isHeadingLine(o.line)
      : HIGH_ENTROPY.has(cat)
        ? (o: { line: string; column: number }) => isSwiftFieldHead(o.line, o.column)
        : null;
    if (!noise) return true;
    const occ = occurrences(c.value, input);
    return !(occ.length && occ.every(noise));
  });
}
