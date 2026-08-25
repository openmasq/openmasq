// @vitest-environment jsdom
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";
import type { ProviderId } from "@openmasq/llm";
import { setDynamicModels } from "@openmasq/llm";
import { runMemoryLife } from "./memoryLife";
import { MEMORY_LIFE } from "./memoryScenarios";
import { MEMORY_TANGLE } from "./memoryScenarios2";

// LA MÉMOIRE contre un modèle VIVANT : le même cycle de vie 8-phases que le test mock,
// mais l'agent ET l'extracteur sont le vrai modèle. Diagnostic payant (`pnpm eval`),
// jamais un gate CI — la satisfiabilité est prouvée gratuitement par memoryLife.test.ts.
const KEY = process.env.OPENMASQ_EVAL_API_KEY || process.env.ZEN_API_KEY;
const PROVIDER = (process.env.OPENMASQ_EVAL_PROVIDER || "openrouter") as ProviderId;
const MODEL_ID = process.env.OPENMASQ_EVAL_MODEL || "poolside/laguna-s-2.1:free";
const BASE_URL = process.env.OPENMASQ_EVAL_BASE_URL || undefined;
const ONLY = process.env.OPENMASQ_EVAL_ONLY;

describe.skipIf(!KEY || (ONLY !== undefined && !"memoire".startsWith(ONLY)))(
  `mémoire — cycle de vie réel (${MODEL_ID})`,
  () => {
    for (const SC of [MEMORY_LIFE, MEMORY_TANGLE])
    it(
      SC.name,
      async () => {
        // Miroir du catalogue dynamique LIVE de l'app (voir scenarios/evalSuite.ts) :
        // sans lui, un slug OpenRouter inconnu du registre statique part en flux simple.
        if (PROVIDER === "openrouter") {
          setDynamicModels("openrouter", [{ id: MODEL_ID, label: MODEL_ID, provider: "openrouter", tools: true }]);
        }
        const res = await runMemoryLife(SC, {
          model: { provider: PROVIDER, modelId: MODEL_ID, apiKey: KEY, baseUrl: BASE_URL },
          softFail: true, // chaque phase est mesurée même après une rouge
        });
        const ok = res.rows.filter((r) => r.ok).length;
        const slug = MODEL_ID.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
        const dir = resolve(process.cwd(), "evals-reports", slug);
        mkdirSync(dir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const file = resolve(dir, `${stamp}-memoire-${SC.name}.md`);
        writeFileSync(
          file,
          [
            `# Eval mémoire (${SC.name}) — ${MODEL_ID}`,
            "",
            `- **Conformité** : ${ok}/${res.rows.length} phases · **Cartes finales** : ${res.memory.cards.length}`,
            "",
            "| Phase | Verdict | Durée |",
            "|---|---|---|",
            ...res.rows.map((r) => `| ${r.phase} | ${r.ok ? "✅" : `❌ ${r.error}`} | ${(r.ms / 1000).toFixed(1)} s |`),
            "",
          ].join("\n"),
        );
        console.log(`\n📊 rapport : ${file}`);
        if (ok < res.rows.length) {
          throw new Error(
            `mémoire : ${ok}/${res.rows.length} phases conformes\n` +
              res.rows.filter((r) => !r.ok).map((r) => `  · ${r.phase} : ${r.error}`).join("\n"),
          );
        }
      },
      600_000,
    );
  },
);
