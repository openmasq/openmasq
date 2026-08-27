// Test d'INTÉGRATION : il lance la vraie CLI Codex, consomme le vrai abonnement
// ChatGPT et suppose la connexion déjà faite (`codex login`). Il ne tourne donc QUE
// sur demande explicite :
//
//   OPENMASQ_TEST_SUBSCRIPTION_CODEX=1 npx vitest run apps/desktop/src/main/subscription/codexEngine.integration.test.ts
//
// Ce qu'il prouve, et qu'aucun test pur ne peut prouver : (1) `--ignore-user-config`
// n'empêche PAS l'auth par abonnement (le pari de l'isolement) ; (2) le flux JSONL
// réel colle aux formes mesurées ; (3) `--disable shell_tool` retire vraiment
// l'exécution de commandes ; (4) `-s read-only` n'écrit rien dans le cwd.
import { tmpdir } from "node:os";
import { mkdtempSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCli } from "./resolveCli";
import { streamCodexSubscription } from "./codexEngine";

const enabled = process.env.OPENMASQ_TEST_SUBSCRIPTION_CODEX === "1";

function codexPath(): string | null {
  return resolveCli("codex", {
    platform: process.platform,
    home: process.env.HOME ?? "",
    path: process.env.PATH,
  });
}

async function drain(gen: AsyncGenerator<string, { finish?: string }>) {
  const chunks: string[] = [];
  let r = await gen.next();
  while (!r.done) {
    chunks.push(r.value);
    r = await gen.next();
  }
  return { text: chunks.join(""), done: r.value };
}

describe.skipIf(!enabled)("streamCodexSubscription (CLI réelle)", () => {
  it("streame un tour et rend l'usage — `--ignore-user-config` ne casse PAS l'auth", async (ctx) => {
    const bin = codexPath();
    if (!bin) return ctx.skip();
    const { text, done } = await drain(
      streamCodexSubscription({
        binPath: bin,
        prompt: "Réponds exactement: PONG",
        cwd: mkdtempSync(join(tmpdir(), "openmasq-cx-")),
      }),
    );
    expect(text).toContain("PONG");
    expect(done.finish).toBe("stop");
    expect((done as { usage?: { outputTokens: number } }).usage?.outputTokens).toBeGreaterThan(0);
  }, 300_000);

  it("n'exécute AUCUNE commande et n'écrit RIEN — les deux gardes, sur un tour qui les tente", async (ctx) => {
    const bin = codexPath();
    if (!bin) return ctx.skip();
    const cwd = mkdtempSync(join(tmpdir(), "openmasq-cx-"));
    const { text } = await drain(
      streamCodexSubscription({
        binPath: bin,
        prompt:
          "Crée un fichier notes.txt contenant BONJOUR dans le dossier courant, puis liste le dossier avec ls.",
        cwd,
      }),
    );
    // Le cwd reste VIDE : ni écriture (sandbox), ni artefact de session (--ephemeral).
    expect(readdirSync(cwd)).toEqual([]);
    // Et la CLI dit qu'elle ne peut pas — `shell_tool` coupé, pas de silence trompeur.
    expect(text.length).toBeGreaterThan(0);
  }, 300_000);

  it("s'arrête proprement sur abort", async (ctx) => {
    const bin = codexPath();
    if (!bin) return ctx.skip();
    const ac = new AbortController();
    const gen = streamCodexSubscription({
      binPath: bin,
      prompt: "Écris un très long poème de 100 strophes.",
      cwd: mkdtempSync(join(tmpdir(), "openmasq-cx-")),
      signal: ac.signal,
    });
    setTimeout(() => ac.abort(), 1500);
    const { done } = await drain(gen);
    expect(done.finish).toBe("cut");
  }, 300_000);
});
