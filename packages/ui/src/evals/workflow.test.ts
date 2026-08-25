// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { GMAIL } from "./servers";
import { calls, mockModel, says, type MockModel } from "./mockModel";
import { runWorkflow, type WorkflowRun } from "./workflow";

// User workflows through the REAL store (send pipeline → redaction → loop →
// persistence), scripted model — free and deterministic, runs on every commit.

const NER = {
  "Karl Studio": "company",
  "Jean Vannec": "name",
  "Évreux": "location",
};

let m: MockModel | undefined;
let run: WorkflowRun | undefined;
afterEach(async () => {
  m?.close();
  m = undefined;
  await run?.dispose();
  run = undefined;
});

const model = () => ({ provider: "openai-compat" as const, modelId: "qwen2.5", baseUrl: m!.url });

describe("workflow — plain send (no tools)", () => {
  it("the redaction rules decide what the model sees; the user's copy is restored", async () => {
    m = await mockModel([
      // Echo back the exact user content the model received — proving from the model's
      // own side of the wire what it was shown.
      (req) => says(`Reçu : ${req.messages[req.messages.length - 1]?.content ?? ""}`),
    ]);
    run = await runWorkflow({ model: model(), ner: NER, rules: { company: true, name: true } });
    await run.send("Écris un mot de remerciement à Jean Vannec de Karl Studio.");

    // The model saw fakes for the enabled categories…
    const seen = run.transcript.modelInbox();
    expect(seen).not.toContain("Jean Vannec");
    expect(seen).not.toContain("Karl Studio");
    // …the vault holds the reals…
    expect(run.vaultReals()).toEqual(expect.arrayContaining(["Jean Vannec", "Karl Studio"]));
    // …and the reply the USER sees is de-redacted back to the real values.
    expect(run.lastAssistant()?.content).toContain("Jean Vannec");
    expect(run.lastAssistant()?.content).toContain("Karl Studio");
    // The user bubble carries the redaction pills' data (spans + count).
    expect(run.lastUser()?.redactedSpans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "Jean Vannec", kind: "name" }),
        expect.objectContaining({ value: "Karl Studio", kind: "company" }),
      ]),
    );
  }, 30_000);

  it("a category the rules DISABLE reaches the model in clear (that is the user's choice)", async () => {
    m = await mockModel([(req) => says(`Reçu : ${req.messages[req.messages.length - 1]?.content ?? ""}`)]);
    run = await runWorkflow({ model: model(), ner: NER, rules: { company: false, name: true } });
    await run.send("Écris un mot à Jean Vannec de Karl Studio.");

    const seen = run.transcript.modelInbox();
    expect(seen).toContain("Karl Studio"); // company OFF → in clear, by design
    expect(seen).not.toContain("Jean Vannec"); // name ON → still redacted
  }, 30_000);

  it("the same value keeps the SAME fake across turns (vault coherence)", async () => {
    m = await mockModel([
      (req) => says(`T1 : ${req.messages[req.messages.length - 1]?.content}`),
      (req) => says(`T2 : ${req.messages[req.messages.length - 1]?.content}`),
    ]);
    run = await runWorkflow({ model: model(), ner: NER, rules: { company: true } });
    await run.send("Premier point sur Karl Studio.");
    const fake1 = Object.entries(run.conversation().redactionVault ?? {}).find(
      ([, real]) => real === "Karl Studio",
    )?.[0];
    await run.send("Second point sur Karl Studio.");
    const fakes = Object.entries(run.conversation().redactionVault ?? {}).filter(
      ([, real]) => real === "Karl Studio",
    );
    expect(fake1).toBeTruthy();
    expect(fakes).toHaveLength(1); // ONE fake per value, not one per turn
    expect(fakes[0][0]).toBe(fake1);
  }, 30_000);
});

describe("workflow — agent turn (tools)", () => {
  it("the tool receives the REAL value while the model only ever held the fake", async () => {
    m = await mockModel([
      (req) => {
        // Find the fake the model was given for the company, and search with IT —
        // exactly what a real model does (it only knows the fake).
        const userMsg = String(req.messages.find((x) => x.role === "user")?.content ?? "");
        const fake = /« (.+?) »/.exec(userMsg)?.[1] ?? "??";
        return calls({ name: "gmail__search_messages", args: { query: fake } });
      },
      says("Deux e-mails trouvés."),
    ]);
    run = await runWorkflow({ model: model(), ner: NER, rules: { company: true }, servers: [GMAIL] });
    await run.send("Cherche les e-mails de « Karl Studio » dans ma boîte.");

    expect(run.transcript.leaked(["Karl Studio"])).toEqual([]); // model never saw the real
    const wire = run.transcript.wireArgsOf("gmail__search_messages");
    expect(wire?.query).toBe("Karl Studio"); // the tool DID (rule 11)
  }, 30_000);

  it("a write opens the card; refused ⇒ never dispatched; the trace shows the refusal", async () => {
    m = await mockModel([
      calls({ name: "gmail__send_email", args: { to: "a@b.c", subject: "Devis", body: "ok" } }),
      says("Je n'ai pas envoyé l'e-mail."),
    ]);
    run = await runWorkflow({ model: model(), servers: [GMAIL], approveWrites: false });
    await run.send("Envoie un e-mail à a@b.c pour dire ok.");

    expect(run.gates.writes).toEqual([
      expect.objectContaining({ tool: "gmail__send_email", approved: false }),
    ]);
    expect(run.transcript.dispatched()).not.toContain("gmail__send_email");
    // The persisted tool trace on the assistant message records the refused call.
    const trace = run.lastAssistant()?.toolCalls ?? [];
    expect(trace.some((c) => c.tool === "send_email" && !c.ok)).toBe(true);
  }, 30_000);

  it("approved ⇒ dispatched with the REAL recipient", async () => {
    m = await mockModel([
      calls({ name: "gmail__send_email", args: { to: "contact@karl-studio.fr", subject: "Merci", body: "Bien reçu." } }),
      says("Envoyé."),
    ]);
    run = await runWorkflow({ model: model(), servers: [GMAIL], approveWrites: true });
    await run.send("Réponds merci à contact@karl-studio.fr.");

    expect(run.gates.writes[0]?.approved).toBe(true);
    // email is a DEFAULT-ON deterministic category: the model held a fake address,
    // the dispatched call carries the real one.
    expect(run.transcript.leaked(["contact@karl-studio.fr"])).toEqual([]);
    expect(run.transcript.wireArgsOf("gmail__send_email")?.to).toBe("contact@karl-studio.fr");
  }, 30_000);
});

describe("workflow — in-conversation failure surfaces", () => {
  it("an unreachable model persists an ERROR turn (no silent drop, no banner-only)", async () => {
    // No mock server at this port: the provider client fails to connect.
    run = await runWorkflow({
      model: { provider: "openai-compat", modelId: "qwen2.5", baseUrl: "http://127.0.0.1:9" },
    });
    await run.send("Bonjour ?");
    const last = run.lastAssistant();
    expect(last?.error).toBe(true);
    expect(last?.pending).toBeFalsy();
    expect(run.lastUser()?.content).toBe("Bonjour ?"); // the user's message stays put
  }, 30_000);
});

describe("workflow — the fake is per-conversation, not a global deterministic mapping", () => {
  // The reported bug: « Augustin Vaudel » → « Simon Cros » in EVERY conversation, so a held
  // fake reverses by dictionary. Two separate conversations must now fake the same real
  // value DIFFERENTLY (each mints its own secret salt), while each stays reversible.
  async function fakeSentFor(name: string): Promise<{ fake: string; real: string[] }> {
    const mm = await mockModel([(req) => says(`ok ${req.messages[req.messages.length - 1]?.content}`)]);
    const r = await runWorkflow({ model: model2(mm), ner: { [name]: "name" }, rules: { name: true } });
    try {
      await r.send(`Contacte ${name} à ce sujet.`);
      const wire = r.transcript
        .events.filter((e) => e.t === "model:in")
        .flatMap((e) => (e.t === "model:in" ? e.messages.filter((x) => x.role === "user") : []))
        .map((x) => x.content).join("|");
      // The fake that replaced the name in the wire (the vault value it maps back to).
      const fake = Object.entries(r.conversation().redactionVault ?? {}).find(([, v]) => v === name)?.[0] ?? "";
      return { fake, real: [wire, ...r.vaultReals()] };
    } finally {
      mm.close();
      await r.dispose();
    }
  }
  const model2 = (mm: MockModel) => ({ provider: "openai-compat" as const, modelId: "qwen2.5", baseUrl: mm.url });

  it("two conversations fake the SAME name differently, both hiding the real value", async () => {
    // THREE draws, and the assertion is "not ALL identical" — not "the first two differ".
    // The invariant is that the mapping is not a GLOBAL deterministic function of the
    // name (the per-conversation salt), and a deterministic mapping yields three
    // identical fakes. Two draws colliding by chance does NOT disprove it: the fake pool
    // for a category is finite, so a same-fake pair happens on its own — and it did,
    // flaking `pnpm verify` while passing on every re-run, which is the worst kind of
    // red (it teaches you to re-run instead of to look).
    const runs = [
      await fakeSentFor("Augustin Vaudel"),
      await fakeSentFor("Augustin Vaudel"),
      await fakeSentFor("Augustin Vaudel"),
    ];
    for (const r of runs) {
      expect(r.fake).toBeTruthy();
      expect(r.real[0]).not.toContain("Augustin Vaudel"); // the model never saw the real name
    }
    expect(
      new Set(runs.map((r) => r.fake)).size,
      "every conversation produced the SAME fake — the mapping is deterministic",
    ).toBeGreaterThan(1);
  }, 45_000);
});

describe("workflow — fork d'une conversation depuis un message (kit)", () => {
  it("copies the thread up to the message INCLUSIVE, with the redaction lineage (vault+salt)", async () => {
    m = await mockModel([
      (req) => says(`T1 : ${req.messages[req.messages.length - 1]?.content}`),
      (req) => says(`T2 : ${req.messages[req.messages.length - 1]?.content}`),
    ]);
    run = await runWorkflow({ model: model(), ner: NER, rules: { company: true } });
    await run.send("Premier point sur Karl Studio.");
    await run.send("Second point, sans rapport.");
    const src = run.conversation();
    const cutAt = src.messages[1]; // the first assistant reply
    const forkId = run.api().forkConversation(src.id, cutAt.id);
    await run.flush();
    expect(forkId).toBeTruthy();
    const fork = run.api().conversations.find((c) => c.id === forkId)!;
    // The cut: messages up to AND INCLUDING the fork point, nothing after.
    expect(fork.messages.map((x) => x.id)).toEqual(src.messages.slice(0, 2).map((x) => x.id));
    // The redaction LINEAGE rides along: same vault mapping + same salt, so the copied
    // turns stay reversible and the continued thread keeps one fake per value.
    expect(fork.redactionVault).toEqual(src.redactionVault);
    expect(fork.redactionSalt).toBe(src.redactionSalt);
    expect(fork.title).toContain("(fork)");
  }, 30_000);
});
