import type { Detection } from "../../types";
import { redactionCategory } from "../../kinds";

/**
 * Where the values of a DISABLED category sit in the input.
 *
 * Turning a category off must RELEASE its values, but detectors overlap: an ADDRESS is made
 * of locations, a company name can contain one. With `address` off, the address detector
 * goes quiet while the NER's LOC spans inside that very address stay — the user got
 * « 12 [LOCATION1], 75011 [LOCATION2] », i.e. neither the value they asked to see nor a
 * readable document, under a banner claiming addresses were left in clear.
 *
 * So a disabled candidate's span becomes a clear ZONE: {@link filterCandidates} drops any
 * candidate that never occurs outside one. A `forced` value is not a zone — the user asked
 * for that one explicitly — and an org-MANDATED category is never dropped by the gate.
 */
/**
 * The categories whose span may release a FRAGMENT, and the only fragment category it
 * releases (`location` — the parts an address or an org name is built from).
 *
 * ⚠️ This list is what keeps the gate fail-CLOSED, and it is deliberately tiny. Without it
 * the rule ran on ANY disabled category, so one over-long NER span (a detector that tagged
 * a whole line as ORG) turned into a clear zone and released the name, e-mail and phone
 * sitting inside it — measured in the app, a leak. Anything not listed here stays redacted
 * whatever it sits inside; widening it means proving no detector can span a credential.
 */
const RELEASES_FRAGMENTS: ReadonlySet<string> = new Set(["address", "company"]);
/** The one category a released span may take down with it. */
export const RELEASABLE_FRAGMENT = "location";

/** Where the released values sit, and what they are — one pass, one result, no hidden
 *  module state (the two must describe the SAME pass or the pre-filter lies). */
export interface DisabledZones {
  spans: Array<[number, number]>;
  values: string[];
}

export function disabledValueSpans(
  candidates: readonly Detection[],
  input: string,
  disabled: ReadonlySet<string>,
): DisabledZones {
  const none: DisabledZones = { spans: [], values: [] };
  if (!disabled.size || !input) return none;
  // ⚠️ HOT PATH — this runs on every send and every document. Two bail-outs keep it from
  // costing anything in the overwhelmingly common case (measured: scanning naively nearly
  // DOUBLED the deterministic corpus pipeline, 2.8 s → 4.8 s):
  //   • nothing of the releasable category among the candidates ⇒ no zone can matter;
  //   • the released VALUES are deduped — variant expansion emits the same address many
  //     times over, and each duplicate would re-scan the whole input.
  let hasFragment = false;
  const released = new Set<string>();
  for (const c of candidates) {
    const cat = redactionCategory(c.category);
    if (cat === RELEASABLE_FRAGMENT) {
      hasFragment = true;
    } else if (!c.forced && c.value && RELEASES_FRAGMENTS.has(cat) && disabled.has(cat)) {
      released.add(c.value);
    }
  }
  if (!hasFragment || !released.size) return none;
  const spans: Array<[number, number]> = [];
  for (const value of released) {
    for (let i = input.indexOf(value); i >= 0; i = input.indexOf(value, i + 1)) {
      spans.push([i, i + value.length]);
    }
  }
  return { spans, values: [...released] };
}

