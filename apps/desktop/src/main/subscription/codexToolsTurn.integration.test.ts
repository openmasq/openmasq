// INTEGRATION test: the real Codex CLI, the real ChatGPT subscription, real tokens.
// Kept behind the same flag as `codexEngine.integration.test.ts`:
//
//   OPENMASQ_TEST_SUBSCRIPTION_CODEX=1 npx vitest run apps/desktop/src/main/subscription/codexToolsTurn.integration.test.ts
//
// What it proves, and what no pure test can prove: the `-c mcp_servers.…` override
// SURVIVES `--ignore-user-config` (the bridge is seen), `default_tools_approval_mode="approve"`
// lets the call go out in a non-interactive `exec`, and the call is CAPTURED by the bridge
// instead of being executed by the CLI.
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
        // ⚠️ The test's tool must be something the model CANNOT do any other way.
        // Measured: on a question the web can answer (the weather) it picks
        // `web_search` — active server-side, see `codexEngine.ts` — and on "my files"
        // it searches the disk. The user's Dropbox, on the other hand, only exists behind
        // the bridge: that's what makes this test a measure of the WIRING, not the mood
        // of the model.
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
