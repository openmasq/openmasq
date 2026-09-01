// INTEGRATION test: it launches the real Antigravity CLI (`agy`), consumes the real
// Google subscription, and assumes the connection is already made. It therefore only
// runs on explicit request:
//
//   OPENMASQ_TEST_SUBSCRIPTION_ANTIGRAVITY=1 npx vitest run apps/desktop/src/main/subscription/antigravityEngine.integration.test.ts
//
// What it proves, and that no pure test can prove: (1) `--app_data_dir` — an
// UNDOCUMENTED flag, so the first thing a CLI update would take away — does NOT
// prevent subscription auth (the isolation bet, exactly as `--ignore-user-config` for
// codex); (2) the real NDJSON flow matches the measured shapes; (3) the headless
// auto-deny really removes command execution, since this CLI has no flag to cut tools
// with — if that ever changed, this is where it shows.
import { tmpdir } from "node:os";
import { mkdtempSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCli } from "./resolveCli";
import { streamAntigravitySubscription } from "./antigravityEngine";

const enabled = process.env.OPENMASQ_TEST_SUBSCRIPTION_ANTIGRAVITY === "1";

function agyPath(): string | null {
  return resolveCli("antigravity", {
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

describe.skipIf(!enabled)("streamAntigravitySubscription (CLI réelle)", () => {
  it("streame un tour et rend l'usage — `--app_data_dir` ne casse PAS l'auth", async (ctx) => {
    const bin = agyPath();
    if (!bin) return ctx.skip();
    const { text, done } = await drain(
      streamAntigravitySubscription({
        binPath: bin,
        prompt: "Réponds exactement: PONG",
        cwd: mkdtempSync(join(tmpdir(), "openmasq-agy-")),
      }),
    );
    expect(text).toContain("PONG");
    expect(done.finish).toBe("stop");
    expect((done as { usage?: { outputTokens: number } }).usage?.outputTokens).toBeGreaterThan(0);
  }, 300_000);

  it("n'exécute AUCUNE commande et n'écrit RIEN — sur un tour qui les tente", async (ctx) => {
    const bin = agyPath();
    if (!bin) return ctx.skip();
    const cwd = mkdtempSync(join(tmpdir(), "openmasq-agy-"));
    // Le refus vient du mode headless (aucune permission accordée dans NOTRE dossier de
    // données) : soit le modèle l'annonce en prose, soit le tour finit vide et le flux
    // rend l'erreur expliquée. Les deux sont acceptables ; ce qui ne l'est pas, c'est
    // qu'un fichier apparaisse.
    await drain(
      streamAntigravitySubscription({
        binPath: bin,
        prompt:
          "Crée un fichier notes.txt contenant BONJOUR dans le dossier courant, puis liste le dossier avec ls.",
        cwd,
      }),
    ).catch(() => ({ text: "", done: {} }));
    expect(readdirSync(cwd)).toEqual([]);
  }, 300_000);

  it("s'arrête proprement sur abort", async (ctx) => {
    const bin = agyPath();
    if (!bin) return ctx.skip();
    const ac = new AbortController();
    const gen = streamAntigravitySubscription({
      binPath: bin,
      prompt: "Écris un très long poème de 100 strophes.",
      cwd: mkdtempSync(join(tmpdir(), "openmasq-agy-")),
      signal: ac.signal,
    });
    setTimeout(() => ac.abort(), 1500);
    const { done } = await drain(gen);
    expect(done.finish).toBe("cut");
  }, 300_000);
});
