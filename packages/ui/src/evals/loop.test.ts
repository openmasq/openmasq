import { describe, expect, it } from "vitest";
import { runEval } from "./loop";
import { GMAIL } from "./servers";
import { calls, mockModel, says } from "./mockModel";

// Proves the LOOP-harness wiring against the scripted model server (`mockModel.ts`):
// the real loop, the real redaction, real HTTP — but a scripted "model", so it costs
// nothing and is deterministic. Hence `.test.ts`: it runs in the FREE suite on every
// commit, precisely to protect the PAID one. If this is red, a failing real eval is
// OUR bug, not the model's — and you learn that without spending a call.
//
// It already earned its keep: `WriteConfirmInfo.tool` is the BARE name while every other
// event is namespaced, so the scenarios' `confirms()` cross-reference could never match
// and would have scored an OPEN write gate as a missing one.
describe("loop harness wiring (mock model — free, deterministic)", () => {
  it("real prompt → redacted for the model → REAL value to the tool", async () => {
    const m = await mockModel([
      calls({ name: "gmail__search_messages", args: { query: "Karl Studio" } }),
      says("Trouvé."),
    ]);
    try {
      const { transcript, vault, wirePrompt } = await runEval({
        prompt: "Cherche les e-mails de contact@karl-studio.fr",
        servers: [GMAIL], provider: "openai-compat", modelId: "mock",
        apiKey: "mock-key", baseUrl: m.url,
      });
      const reals = Object.values(vault);
      expect(reals).toContain("contact@karl-studio.fr");          // the engine redacted it
      expect(wirePrompt).not.toContain("contact@karl-studio.fr");  // the model got a fake
      expect(transcript.leaked(reals)).toEqual([]);                // …and never saw the real
      expect(transcript.dispatched()).toEqual(["gmail__search_messages"]);
    } finally { m.close(); }
  }, 30_000);

  it("a scripted write is gated: asked, confirmed, refused ⇒ never dispatched", async () => {
    const m = await mockModel([
      calls({ name: "gmail__send_email", args: { to: "a@b.c", subject: "s", body: "b" } }),
      says("Refusé."),
    ]);
    try {
      const { transcript } = await runEval({
        prompt: "Envoie un mail à a@b.c", servers: [GMAIL], provider: "openai-compat",
        modelId: "mock", apiKey: "mock-key", baseUrl: m.url, approveWrites: false,
      });
      expect(transcript.asked()).toContain("gmail__send_email");
      expect(transcript.confirms()[0]).toMatchObject({ tool: "gmail__send_email", approved: false });
      expect(transcript.dispatched()).not.toContain("gmail__send_email");
    } finally { m.close(); }
  }, 30_000);
});
