import type { Detection } from "../../types";
import { escapeRegExp } from "../../util";
import { SUF, SUF_LONG } from "../../engine/addresses/shapes";

/**
 * A detected span, extended to the EDGE of the datum it sits in — the complement of
 * `spanEdges.ts`, which trims. Two moves, both measured on 2026-09-07 (`bench/spans/`,
 * span-containment): the product FOUND the entity and left its most identifying part in
 * clear beside the fake.
 *
 *  1. **The house number of a street.** A NER or the gazetteer names « Justin Terrace »
 *     and the pipeline replaces it — while « 4893 » stays, so the model reads « 4893
 *     Rue des Lilas »: a real number on an invented street, and the number is the part
 *     that finds the door. The number is joined when it is GLUED to a value that ends in a
 *     street type (`addressShapes.ts` `SUF`): a count (« 4 Paris offices ») never precedes
 *     a street-type word, and a bare city never carries one.
 *  2. **Two ORG fragments that touch.** « Lublin Remand » and « Centre » arrive as two
 *     candidates of the same category, separated by one space in the text; two fakes for
 *     one institution, and the model reads two. Joined when the joint string occurs
 *     verbatim; ORG/COMPANY only — two NAMES that touch are two people, two CITIES a route.
 *
 * Both ADD a candidate rather than rewrite one: the de-nest step (`filter.ts`) drops the
 * fragment when every occurrence sits inside the longer value, and keeps it when it also
 * stands alone elsewhere — the occurrence-safe rule that already governs nesting.
 */
const STREET_END = new RegExp(`(?:^|[\\s'’-])(?:${SUF}|${SUF_LONG})\\.?$`, "iu");
const ADDRESS_CATS = new Set(["ADDRESS", "LOCATION", "LOC", "CITY", "PLACE", "GEO", "NAME"]);
const ORG_CATS = new Set(["ORG", "ORGANIZATION", "ORGANISATION", "COMPANY", "EMPLOYER"]);

/**
 * The leftmost `<number> <value>` in `input` — the same answer as running the house-number
 * regex over the whole text, without scanning the whole text per candidate (a 200k-character
 * paste carries thousands). The regex is unchanged; it is only tried, STICKY, at the few
 * positions where it can start: a match ends its spaces exactly at an occurrence of the
 * value, and its number group spans at most 11 code units before them. Occurrences are
 * visited left to right, so the first hit is the leftmost.
 */
function houseNumber(input: string, value: string): string | null {
  const re = new RegExp(`(?<![\\p{L}\\p{N}/-])(\\d{1,5}[A-Za-z]?(?:[-/]\\d{1,4})?)[ \\u00A0]+${escapeRegExp(value)}(?![\\p{L}\\p{N}])`, "uy");
  for (let j = input.indexOf(value); j !== -1; j = input.indexOf(value, j + 1)) {
    let sp = j;
    while (sp > 0 && (input[sp - 1] === " " || input[sp - 1] === "\u00A0")) sp--;
    if (sp === j) continue;
    for (let p = Math.max(0, sp - 11); p < sp; p++) {
      re.lastIndex = p;
      const m = re.exec(input);
      if (m) return m[1] as string;
    }
  }
  return null;
}

/** Is `${a} ${b}` in `input`? Answered for many pairs at once: every text that FOLLOWS
 *  `${a} ` is sliced once per distinct b-length, so a pair costs a `Set.has`. */
function followers(input: string, a: string, lengths: readonly number[]): Set<string> {
  const lead = `${a} `;
  const out = new Set<string>();
  for (let i = input.indexOf(lead); i !== -1; i = input.indexOf(lead, i + 1)) {
    const at = i + lead.length;
    for (const n of lengths) if (at + n <= input.length) out.add(input.slice(at, at + n));
  }
  return out;
}

export function extendEdges(input: string, candidates: readonly Detection[]): Detection[] {
  const out: Detection[] = [];
  const have = new Set(candidates.map((c) => `${c.category}::${c.value}`));
  const add = (value: string, category: string) => {
    const key = `${category}::${value}`;
    if (have.has(key)) return;
    have.add(key);
    out.push({ value, category });
  };
  // A value repeats once per detected occurrence: the house number depends on the value
  // alone, so it is computed once.
  const numbered = new Map<string, string | null>();
  for (const c of candidates) {
    const cat = c.category.toUpperCase();
    // 1. house number → street
    if (ADDRESS_CATS.has(cat) && /^\p{L}/u.test(c.value) && STREET_END.test(c.value)) {
      if (!numbered.has(c.value)) numbered.set(c.value, houseNumber(input, c.value));
      const n = numbered.get(c.value);
      if (n) add(`${n} ${c.value}`, "ADDRESS");
    }
  }
  // 2. touching ORG fragments. Duplicates (same category+value as `a`, same value as `b`)
  // could only re-add a key already added, so iterating the first occurrences in order
  // yields the same additions in the same order.
  const orgs = candidates.filter((c) => ORG_CATS.has(c.category.toUpperCase()) && c.value.length >= 3);
  const seenA = new Set<string>();
  const as = orgs.filter((c) => !seenA.has(`${c.category}::${c.value}`) && seenA.add(`${c.category}::${c.value}`));
  const bs = [...new Set(orgs.map((c) => c.value))];
  const lengths = [...new Set(bs.map((b) => b.length))];
  const follow = new Map<string, Set<string>>();
  for (const a of as) {
    let next = follow.get(a.value);
    if (!next) {
      next = followers(input, a.value, lengths);
      follow.set(a.value, next);
    }
    if (!next.size) continue;
    for (const b of bs) {
      if (a.value === b) continue;
      if (next.has(b)) add(`${a.value} ${b}`, a.category);
    }
  }
  return out;
}
