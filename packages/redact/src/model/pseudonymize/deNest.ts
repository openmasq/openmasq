import type { Detection } from "../../types";
import { redactionCategory } from "../../kinds";
import { positionsOf } from "../../positions";

/**
 * Drop candidates fully SUBSUMED by a longer one — e.g. a NER-detected NAME
 * ("julien.sabourdin") inside a regex EMAIL ("julien.sabourdin@gmail.com") would
 * otherwise be redacted as a SECOND, overlapping item (2 chips for 1 email).
 * Value-based + occurrence-safe: a candidate is dropped only when EVERY occurrence
 * of its value sits inside a longer candidate's value — a standalone occurrence
 * elsewhere (a real name NOT in an email) is still caught.
 */
export function deNest(kept: Detection[], input: string): Detection[] {
  // Exact VALUE duplicate between the generic `apikey` heuristic and a SPECIFIC rule: the
  // rule wins, else the LAST category overwrites the display (« api token » on a BIC).
  const hasSpecific = new Set(
    kept.filter((c) => redactionCategory(c.category) !== "apikey").map((c) => c.value),
  );
  kept = kept.filter((c) => !(redactionCategory(c.category) === "apikey" && hasSpecific.has(c.value)));
  // The verdict depends on the VALUE alone (its supersets are read from the same list), and
  // a long text repeats values thousands of times: judged once per distinct value. A value
  // no DISTINCT value contains is free without walking the whole list.
  // « Is v inside ANOTHER distinct value? » for all of them at once: the distinct values
  // joined by a separator none carries, where v is found once at its own slot and once
  // more for each value that contains it (a containing value is necessarily longer).
  const distinct = [...new Set(kept.map((c) => c.value))];
  const SEP = "\u0000";
  const joined = distinct.some((v) => v.includes(SEP)) ? null : distinct.join(SEP);
  const verdict = new Map<string, boolean>();
  const survives = (v: string): boolean => {
    const contained = joined === null
      ? distinct.some((o) => o.length > v.length && o.includes(v))
      : positionsOf(joined, v).length > 1;
    if (!contained) return true;
    const supers = kept.filter((o) => o.value.length > v.length && o.value.includes(v));
    let masked = input;
    const applied = new Set<string>();
    for (const s of supers) {
      // Re-masking a value already masked is a no-op when it neither starts nor ends with a
      // space nor holds two in a row: a NEW occurrence would have to overlap a blanked run.
      if (applied.has(s.value)) continue;
      if (!/^ | $| {2}/.test(s.value)) applied.add(s.value);
      masked = masked.split(s.value).join(" ".repeat(s.value.length));
    }
    return masked.includes(v);
  };
  return kept.filter((c) => {
    let ok = verdict.get(c.value);
    if (ok === undefined) {
      ok = survives(c.value);
      verdict.set(c.value, ok);
    }
    return ok;
  });
}
