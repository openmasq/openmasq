/**
 * Intégration RÉELLE : la vraie CLI, le vrai abonnement, de vrais jetons — gardée
 * derrière `OPENMASQ_TEST_SUBSCRIPTION_CLI=1` comme `engine.integration.test.ts`.
 * C'est le SEUL test qui prouve la propriété clé du tour outillé : sans `--safe-mode`,
 * l'auth par abonnement tient TOUJOURS (apiKeySource "none") ET le pont MCP est vu.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { resolveCli } from "./resolveCli";
import { completeSubscriptionTools } from "./toolsTurn";

const enabled = process.env.OPENMASQ_TEST_SUBSCRIPTION_CLI === "1";
const binPath = enabled
  ? resolveCli("claude", { platform: process.platform, home: process.env.HOME ?? "", path: process.env.PATH })
  : null;

const dir = mkdtempSync(join(tmpdir(), "openmasq-toolsturn-int-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe.skipIf(!enabled || !binPath)("tour outillé — vraie CLI (consomme de vrais jetons)", () => {
  it("le modèle appelle NOTRE outil via le pont et l'appel est capturé, pas exécuté", async () => {
    const r = await completeSubscriptionTools(
      { binPath: binPath!, cwd: dir },
      {
        messages: [
          {
            role: "user",
            content:
              "Appelle l'outil `meteo` avec ville=\"Brest\". N'écris rien d'autre.",
          },
        ],
        tools: [
          {
            name: "meteo",
            description: "Donne la météo d'une ville.",
            parameters: {
              type: "object",
              properties: { ville: { type: "string" } },
              required: ["ville"],
            },
          },
        ],
        modelId: "claude-cli-haiku",
      },
    );
    expect(r.stopReason).toBe("tool_calls");
    expect(r.toolCalls[0].name).toBe("meteo");
    expect(r.toolCalls[0].arguments).toEqual({ ville: "Brest" });
  }, 120_000);
});
