// INTEGRATION test: it launches the real Antigravity CLI (`agy`), consumes the real
// Google subscription, and assumes the connection is already made. It therefore only
// runs on explicit request:
//
//   OPENMASQ_TEST_SUBSCRIPTION_ANTIGRAVITY=1 npx vitest run apps/desktop/src/main/subscription/antigravityEngine.integration.test.ts
//
// What it proves, and that no pure test can prove: (1) the session `--settings` does
// NOT prevent subscription auth (`--app_data_dir`, the undocumented flag it replaces, was
// indeed taken away by 1.5); (2) the real NDJSON flow matches the measured shapes; (3) the headless
// auto-deny really removes command execution, since this CLI has no flag to cut tools
// with — if that ever changed, this is where it shows; (4) the TOOLED turn's plugin in a
// disposable `--add-dir` folder is still loaded and its `mcp(openmasq_openmasq/*)` rule still
// lets the bridge's call through — the two measured facts a CLI update can take back.
//
// (3) also pins `agentMode: ""`: since 1.5 the default is AUTO, which approved the write.
import { tmpdir } from "node:os";
import { mkdtempSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCli } from "./resolveCli";
import { streamAntigravitySubscription } from "./antigravityEngine";
import { completeSubscriptionTools } from "./toolsTurn";

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
  it("streame un tour et rend l'usage — `--settings` ne casse PAS l'auth", async (ctx) => {
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

  // The prompt now rides on stdin (`--input-format stream-json`), never argv: a long
  // document no longer depends on the OS command-line cap (Windows ≈ 32 767 chars). This
  // case is the MEASUREMENT the switch waits for, plus a newline-heavy prompt (one line).
  it("un tour bien plus long que la ligne de commande Windows passe, par stdin", async (ctx) => {
    const bin = agyPath();
    if (!bin) return ctx.skip();
    const filler = "Ligne de document sans intérêt particulier.\n".repeat(1000); // ~45 000 caractères
    const { text, done } = await drain(
      streamAntigravitySubscription({
        binPath: bin,
        prompt: `${filler}\nLe mot de passe est KIWI77. Réponds uniquement par le mot de passe.`,
        cwd: mkdtempSync(join(tmpdir(), "openmasq-agy-")),
      }),
    );
    expect(filler.length).toBeGreaterThan(40_000);
    expect(text).toContain("KIWI77");
    expect(done.finish).toBe("stop");
  }, 300_000);

  it("n'exécute AUCUNE commande et n'écrit RIEN — sur un tour qui les tente", async (ctx) => {
    const bin = agyPath();
    if (!bin) return ctx.skip();
    const cwd = mkdtempSync(join(tmpdir(), "openmasq-agy-"));
    // The refusal comes from headless mode (no permission granted in OUR data folder):
    // either the model announces it in prose, or the turn ends empty and the stream
    // renders the explained error. Both are acceptable; what is not is a file appearing.
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

  it("tour OUTILLÉ : le plugin `--add-dir` est chargé et le pont capture l'appel", async (ctx) => {
    const bin = agyPath();
    if (!bin) return ctx.skip();
    const r = await completeSubscriptionTools(
      { cli: "antigravity", label: "Antigravity", binPath: bin, cwd: mkdtempSync(join(tmpdir(), "openmasq-agy-")) },
      {
        messages: [
          {
            role: "user",
            content:
              'You have a tool named openmasq_probe. Call it with text="hello" and reply with exactly the tool output.',
          },
        ],
        tools: [
          {
            name: "openmasq_probe",
            description: "Returns PROBE_OK followed by the given text.",
            parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
          },
        ],
      },
    );
    expect(r.stopReason).toBe("tool_calls");
    expect(r.toolCalls[0]).toMatchObject({ name: "openmasq_probe", arguments: { text: "hello" } });
  }, 300_000);
});
