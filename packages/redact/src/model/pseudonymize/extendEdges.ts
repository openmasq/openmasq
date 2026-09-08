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

export function extendEdges(input: string, candidates: readonly Detection[]): Detection[] {
  const out: Detection[] = [];
  const have = new Set(candidates.map((c) => `${c.category}::${c.value}`));
  const add = (value: string, category: string) => {
    const key = `${category}::${value}`;
    if (have.has(key)) return;
    have.add(key);
    out.push({ value, category });
  };
  for (const c of candidates) {
    const cat = c.category.toUpperCase();
    // 1. house number → street
    if (ADDRESS_CATS.has(cat) && /^\p{L}/u.test(c.value) && STREET_END.test(c.value)) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}/-])(\\d{1,5}[A-Za-z]?(?:[-/]\\d{1,4})?)[ \\u00A0]+${escapeRegExp(c.value)}(?![\\p{L}\\p{N}])`, "u");
      const m = re.exec(input);
      if (m) add(`${m[1]} ${c.value}`, "ADDRESS");
    }
  }
  // 2. touching ORG fragments (n is small: candidates are per text, dozens at most)
  const orgs = candidates.filter((c) => ORG_CATS.has(c.category.toUpperCase()) && c.value.length >= 3);
  for (const a of orgs) {
    for (const b of orgs) {
      if (a === b || a.value === b.value) continue;
      const joint = `${a.value} ${b.value}`;
      if (input.includes(joint)) add(joint, a.category);
    }
  }
  return out;
}
