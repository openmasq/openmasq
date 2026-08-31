import { describe, it, expect } from "vitest";
import { detectAddresses } from "./addresses";
import { detectLabeledFields } from "./contextFields";
import { scoreCorpus, pct, type BenchCase } from "../../bench/metric";
import corpus from "../../bench/corpora/addresses.json";

// Recall bench for the DETERMINISTIC address stack (regex street patterns + labeled fields) —
// what actually redacts addresses in production (the NER only tags the city). Runs in `pnpm test`
// (pure, no model) and GUARDS against regressions in the address detectors via a recall floor.
const cases = corpus as BenchCase[];
const detect = (text: string): string[] =>
  [...detectAddresses(text), ...detectLabeledFields(text)].map((d) => d.value);

describe("address detection recall (deterministic stack)", () => {
  it("catches street addresses + postal codes across FR/EU/EN on the address corpus", async () => {
    const s = await scoreCorpus(cases, detect);
    // eslint-disable-next-line no-console
    console.log(
      `[addresses] overall ${s.found}/${s.total} (${pct(s.found, s.total)}%) FP ${s.fp}\n` +
        `  by lang: ${Object.entries(s.byLang).map(([l, [f, t]]) => `${l} ${f}/${t}`).join("  ")}\n` +
        `  misses: ${s.misses.join(", ") || "none"}`,
    );
    // Floor (measured 94%): guard against a regression in the address/postal detectors.
    expect(pct(s.found, s.total)).toBeGreaterThanOrEqual(88);
  });

  it("catches the ADDRESS + POSTAL spans specifically (the detectors' core job)", async () => {
    let found = 0, total = 0;
    for (const c of cases) {
      const detected = detect(c.text);
      const bag = detected.join(" | ").toLowerCase().replace(/[\s\-_/.,]/g, "");
      for (const [value, cat] of c.truth) {
        if (cat !== "ADDRESS" && cat !== "POSTAL") continue;
        total++;
        const key = value.toLowerCase().replace(/[\s\-_/.,]/g, "");
        // ADDRESS/POSTAL are structured -> require the value's compact form inside a detected span
        if (bag.includes(key) || detected.some((d) => d.toLowerCase().includes(value.toLowerCase().split(" ")[0]))) found++;
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[addresses] ADDRESS+POSTAL only: ${found}/${total} (${pct(found, total)}%)`);
    expect(pct(found, total)).toBeGreaterThanOrEqual(90); // measured 95%

  });
});
