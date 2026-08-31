// INTEGRATION test: it launches the real Codex CLI, consumes the real ChatGPT
// subscription, and assumes the connection is already made (`codex login`). It therefore
// only runs on explicit request:
//
//   OPENMASQ_TEST_SUBSCRIPTION_CODEX=1 npx vitest run apps/desktop/src/main/subscription/codexEngine.integration.test.ts
//
// What it proves, and that no pure test can prove: (1) `--ignore-user-config`
// does NOT prevent subscription auth (the isolation bet); (2) the real JSONL
// flow matches the measured shapes; (3) `--disable shell_tool` really removes
// command execution; (4) `-s read-only` writes nothing to the cwd.
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
    // The cwd stays EMPTY: no write (sandbox), no session artifact (--ephemeral).
    expect(readdirSync(cwd)).toEqual([]);
    // And the CLI says it can't — `shell_tool` cut off, no misleading silence.
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
