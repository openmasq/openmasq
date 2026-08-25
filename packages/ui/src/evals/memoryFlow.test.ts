// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { calls, mockModel, says, type MockModel, type MockRequest } from "./mockModel";
import { runWorkflow, type WorkflowRun } from "./workflow";
import type { MemoryData } from "../types";

// The MÉMOIRE, end to end through the real store: stored REAL, selected client-side,
// injected re-redacted through THIS conversation's vault+salt, pulled via the
// intercepted `memory_search` tool with rule-11 un-redaction. Free suite.

const MEMOIRE: MemoryData = {
  profile: "Consultant indépendant, répond en français.",
  cards: [
    {
      id: "m1",
      entity: "Karl Studio",
      aliases: ["contact@karl-studio.fr"],
      cat: "organisation",
      facts: "Agence de design à Évreux, devis Q3 signé.",
      createdAt: 0,
      updatedAt: 0,
    },
    { id: "m2", entity: "Projet Merlebleu", cat: "projet", facts: "Refonte du site, deadline septembre.", createdAt: 0, updatedAt: 0 },
  ],
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

function systemLegs(r: WorkflowRun): string {
  return r.transcript.events
    .filter((e) => e.t === "model:in")
    .flatMap((e) => (e.t === "model:in" ? e.messages.filter((x) => x.role === "system") : []))
    .map((x) => x.content)
    .join("\n");
}

describe("mémoire — injection re-redacted", () => {
  it("a mentioned entity's card is injected REDACTED — even under the pure regex engine (forced entities)", async () => {
    m = await mockModel([says("Bien noté.")]);
    // No `ner`: the regex engine alone cannot detect a free-form org name. The card's
    // entity rides `forced`, which is what keeps the injection protected anyway.
    run = await runWorkflow({ model: model(), settings: { memoire: MEMOIRE } });
    await run.send("Fais un point sur Karl Studio .");

    const sys = systemLegs(run);
    expect(sys).toContain("Mémoire de l'utilisateur"); // the block IS there…
    expect(sys).not.toContain("Karl Studio"); // …with the entity FAKED
    expect(sys).not.toContain("contact@karl-studio.fr"); // aliases faked too
    expect(run.vaultReals()).toContain("Karl Studio"); // and reversible
    // The user's own TYPED mention is replayed to the SAME fake (the memory pass runs
    // first, so its vault entry covers the typed text even under regex).
    expect(run.transcript.leaked(["Karl Studio"])).toEqual([]);
  }, 30_000);

  it("no signal ⇒ only the profile is injected; an unrelated card stays OUT of the context", async () => {
    m = await mockModel([says("Bonjour !")]);
    run = await runWorkflow({ model: model(), settings: { memoire: MEMOIRE } });
    await run.send("Quelle heure est-il ?");
    const sys = systemLegs(run);
    expect(sys).toContain("Consultant indépendant"); // profile (not PII-detected here — user-authored)
    expect(sys).not.toContain("Nightingale");
    expect(sys).not.toContain("Évreux");
  }, 30_000);

  it("no memory at all ⇒ no block, no memory_search tool offered", async () => {
    m = await mockModel([says("Ok.")]);
    run = await runWorkflow({ model: model() });
    await run.send("Bonjour.");
    expect(systemLegs(run)).not.toContain("Mémoire de l'utilisateur");
    const offered = (m.requests[0]?.tools ?? []).map((t) => t.function.name);
    expect(offered).not.toContain("memory_search");
  }, 30_000);
});

describe("mémoire — memory_search (the model-pulled path, rule 11)", () => {
  it("the model asks with the FAKE, the store matches the REAL, the result returns re-redacted", async () => {
    m = await mockModel([
      (req: MockRequest) => {
        // The model wants to know about the entity it can see — the FAKE in its context.
        const sys = req.messages.find((x) => x.role === "system")?.content ?? "";
        const fake = /- (.+?) \(organisation\)/.exec(String(sys))?.[1] ?? "inconnu";
        return calls({ name: "memory_search", args: { query: fake } });
      },
      says("Voilà ce que je sais."),
    ]);
    run = await runWorkflow({
      model: model(),
      settings: { memoire: MEMOIRE },
      // A server list is needed for the loop to run at all? No — searchMemory alone
      // offers the tool; zero MCP servers is fine (like run_python).
    });
    await run.send("Rappelle-moi où on en est avec Karl Studio .");

    // The tool message the model received: facts present, entity re-redacted.
    const toolLegs = run.transcript.events
      .filter((e) => e.t === "model:in")
      .flatMap((e) => (e.t === "model:in" ? e.messages.filter((x) => x.role === "tool") : []))
      .map((x) => x.content)
      .join("\n");
    expect(toolLegs).toContain("Souvenirs correspondants");
    expect(toolLegs).toContain("devis Q3"); // the facts reached the model…
    expect(toolLegs).not.toContain("Karl Studio"); // …the entity did not (re-redacted)
    expect(run.transcript.leaked(["Karl Studio"])).toEqual([]);
  }, 30_000);

  it("an empty store answer is a plain 'aucun souvenir' — no crash, turn completes", async () => {
    m = await mockModel([
      calls({ name: "memory_search", args: { query: "projet Zeta" } }),
      says("Je n'ai rien en mémoire à ce sujet."),
    ]);
    run = await runWorkflow({
      model: model(),
      settings: { memoire: { cards: [{ id: "x", entity: "Autre Chose", cat: "autre", facts: "x", createdAt: 0, updatedAt: 0 }] } },
    });
    await run.send("Où en est le projet Zeta ?");
    const toolLegs = run.transcript.events
      .filter((e) => e.t === "model:in")
      .flatMap((e) => (e.t === "model:in" ? e.messages.filter((x) => x.role === "tool") : []))
      .map((x) => x.content)
      .join("\n");
    expect(toolLegs).toContain("Aucun souvenir");
    expect(run.lastAssistant()?.pending).toBeFalsy();
  }, 30_000);
});
