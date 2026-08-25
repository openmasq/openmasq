// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { runMemoryLife } from "./memoryLife";
import { MEMORY_LIFE } from "./memoryScenarios";
import { MEMORY_TANGLE } from "./memoryScenarios2";

// GRATUIT, à chaque commit : le cycle de vie complet de la Mémoire sur agent ET
// extracteur scriptés — prouve chaque phase SATISFIABLE (un échec du modèle réel est
// alors bien le sien) et pinne les invariants produit : ancrage anti-hallucination,
// dédup de faits, note explicite, injection redacted, silence hors-sujet, rappel par
// prénom, memory_search, tenue sous croissance + budget.
describe("mémoire — cycle de vie (mock)", () => {
  it(
    "traverse les 8 phases de « vie-de-memoire »",
    async () => {
      const res = await runMemoryLife(MEMORY_LIFE);
      expect(res.rows.map((r) => `${r.phase}:${r.ok ? "✅" : r.error}`)).toEqual(
        MEMORY_LIFE.phases.map((p) => `${p.name}:✅`),
      );
      // L'état final : les 5 vraies entités + la note + le bruit de la phase 8.
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
