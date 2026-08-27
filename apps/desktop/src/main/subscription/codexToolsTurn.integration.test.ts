// Test d'INTÉGRATION : la vraie CLI Codex, le vrai abonnement ChatGPT, de vrais jetons.
// Gardé derrière le même drapeau que `codexEngine.integration.test.ts` :
//
//   OPENMASQ_TEST_SUBSCRIPTION_CODEX=1 npx vitest run apps/desktop/src/main/subscription/codexToolsTurn.integration.test.ts
//
// Ce qu'il prouve, et qu'aucun test pur ne peut prouver : l'override `-c mcp_servers.…`
// SURVIT à `--ignore-user-config` (le pont est vu), `default_tools_approval_mode="approve"`
// laisse l'appel partir dans un `exec` non interactif, et l'appel est CAPTURÉ par le pont
// au lieu d'être exécuté par la CLI.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { resolveCli } from "./resolveCli";
import { completeSubscriptionTools } from "./toolsTurn";

const enabled = process.env.OPENMASQ_TEST_SUBSCRIPTION_CODEX === "1";
const binPath = enabled
  ? resolveCli("codex", {
      platform: process.platform,
      home: process.env.HOME ?? "",
      path: process.env.PATH,
    })
  : null;

const dir = mkdtempSync(join(tmpdir(), "openmasq-codextools-int-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe.skipIf(!enabled || !binPath)("tour outillé codex — vraie CLI (consomme de vrais jetons)", () => {
  it("le modèle appelle NOTRE outil via le pont et l'appel est capturé, pas exécuté", async () => {
    const r = await completeSubscriptionTools(
      { cli: "codex", label: "Codex", binPath: binPath!, cwd: dir },
      {
        // ⚠️ L'outil du test doit être une chose que le modèle NE PEUT PAS faire autrement.
        // Mesuré : sur une question que le web sait résoudre (la météo) il prend
        // `web_search` — actif côté serveur, cf. `codexEngine.ts` — et sur « mes fichiers »
        // il cherche le disque. Le Dropbox de l'utilisateur, lui, n'existe que derrière
        // le pont : c'est ce qui fait de ce test une mesure du BRANCHEMENT, pas de l'humeur
        // du modèle.
        messages: [
          {
            role: "system",
            content:
              "Tu as accès aux connecteurs de l'utilisateur via les outils fournis. Utilise-les.",
          },
          { role: "user", content: "Fais une analyse du contenu de mon Dropbox." },
        ],
        tools: [
          {
            name: "dropbox_search",
            description: "Rechercher des fichiers dans le Dropbox de l'utilisateur.",
            parameters: {
              type: "object",
              properties: { query: { type: "string" } },
              required: ["query"],
            },
          },
        ],
      },
    );
    expect(r.stopReason).toBe("tool_calls");
    expect(r.toolCalls[0].name).toBe("dropbox_search");
  }, 180_000);
});
