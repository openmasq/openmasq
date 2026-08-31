// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { runMemoryLife } from "./memoryLife";
import { MEMORY_LIFE } from "./memoryScenarios";
import { MEMORY_TANGLE } from "./memoryScenarios2";

// FREE, on every commit: the full lifecycle of Mémoire on a scripted agent AND
// extractor — proves each phase SATISFIABLE (a real model's failure is then truly
// its own) and pins the product invariants: anti-hallucination anchoring,
// fact dedup, explicit note, redacted injection, off-topic silence, recall by
// first name, memory_search, holding up under growth + budget.
describe("mémoire — cycle de vie (mock)", () => {
  it(
    "traverse les 8 phases de « vie-de-memoire »",
    async () => {
      const res = await runMemoryLife(MEMORY_LIFE);
      expect(res.rows.map((r) => `${r.phase}:${r.ok ? "✅" : r.error}`)).toEqual(
        MEMORY_LIFE.phases.map((p) => `${p.name}:✅`),
      );
      // The final state: the 5 real entities + the note + phase 8's noise.
      expect(res.memory.cards.length).toBeGreaterThanOrEqual(6);
    },
    120_000,
  );

  it(
    "traverse les 9 phases de « memoire-imbriquee » (homonymes, contradictions, affixes)",
    async () => {
      const res = await runMemoryLife(MEMORY_TANGLE);
      expect(res.rows.map((r) => `${r.phase}:${r.ok ? "✅" : r.error}`)).toEqual(
        MEMORY_TANGLE.phases.map((p) => `${p.name}:✅`),
      );
    },
    120_000,
  );
});
