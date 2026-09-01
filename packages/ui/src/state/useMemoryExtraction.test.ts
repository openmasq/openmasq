// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import type { Conversation, MemoryData, Settings } from "../types";
import {
  MEMORY_SWEEP_MAX,
  MEMORY_SWEEP_RECENCY_MS,
  runMemoryExtraction,
  sweepCandidates,
  useMemoryExtraction,
  type MemoryExtractionDeps,
} from "./useMemoryExtraction";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const act: (cb: () => Promise<void> | void) => Promise<void> = (
  React as unknown as { act: (cb: () => Promise<void> | void) => Promise<void> }
).act;

const NOW = 1_800_000_000_000;
const conv = (over: Partial<Conversation> = {}): Conversation =>
  ({
    id: "c1",
    title: "t",
    modelId: "qwen2.5",
    createdAt: NOW,
    updatedAt: NOW,
    redactionVault: {},
    messages: [
      {
        id: "u1",
        role: "user",
        content: "Retiens le contexte : notre client principal est Karl Studio.",
        redactedSpans: [{ value: "Karl Studio", kind: "company" }],
      },
      { id: "a1", role: "assistant", content: "Noté." },
    ],
    ...over,
  }) as Conversation;

describe("sweepCandidates — le balayage de démarrage est BORNÉ", () => {
  it("filtre au watermark + récence, trie par récence, plafonne", () => {
    const convs = [
      conv({ id: "done", memoryWatermark: 2 }), // already extracted → out
      conv({ id: "old", updatedAt: NOW - MEMORY_SWEEP_RECENCY_MS - 1 }), // too old
      conv({ id: "pending", messages: [{ id: "p", role: "user", content: "x", pending: true } as never] }),
      conv({ id: "r1", updatedAt: NOW - 1000 }),
      conv({ id: "r2", updatedAt: NOW - 100 }),
      conv({ id: "r3", updatedAt: NOW - 10 }),
      conv({ id: "r4", updatedAt: NOW - 1 }),
    ];
    const picked = sweepCandidates(convs, NOW);
    expect(picked.length).toBe(MEMORY_SWEEP_MAX);
    expect(picked.map((c) => c.id)).toEqual(["r4", "r3", "r2"]); // most recent first
  });
});

async function mountHook(deps: MemoryExtractionDeps): Promise<{ unmount: () => Promise<void> }> {
  const Probe = () => {
    useMemoryExtraction(deps);
    return null;
  };
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => root.render(React.createElement(Probe)));
  return {
    unmount: async () => {
      await act(async () => root.unmount());
      el.remove();
    },
  };
}

function hookDeps(over: Partial<MemoryExtractionDeps> = {}): MemoryExtractionDeps & { calls: () => number } {
  let calls = 0;
  const deps: MemoryExtractionDeps = {
    conversations: [conv()],
    activeId: "c1",
    settings: { memoryAuto: true, memoire: { cards: [] } as MemoryData } as Settings,
    complete: async () => {
      calls++;
      return '{"profil":null,"faits":[]}';
    },
    setMemory: () => {},
    patchConversation: () => {},
    idleMs: 60_000, // idle must NOT fire during these tests
    sweepDelayMs: 60_000,
    ...over,
  };
  return Object.assign(deps, { calls: () => calls });
}

/** Direct harness for the PASS (`memoryExtractionRun.ts`): scripted replies, captures
 *  of everything that comes out (model payloads, memory, watermark, feedback). */
function runDeps(replies: Array<string | Error>) {
  const payloads: Array<{ role: string; content: string }[]> = [];
  const noted: Array<{ count: number; ids?: string[]; failed?: boolean }> = [];
  const memoryData: MemoryData[] = [];
  const patches: Array<(c: Conversation) => Conversation> = [];
  let i = 0;
  const deps = {
    settings: { memoryAuto: false, memoire: { cards: [] } as MemoryData } as Settings,
    complete: async (p: { messages: { role: string; content: string }[] }) => {
      payloads.push(p.messages.map((m) => ({ role: m.role, content: m.content })));
      const r = replies[Math.min(i++, replies.length - 1)];
      if (r instanceof Error) throw r;
      return r;
    },
    setMemory: (fn: (m: MemoryData) => MemoryData) => memoryData.push(fn({ cards: [] })),
    patchConversation: (_id: string, fn: (c: Conversation) => Conversation) => patches.push(fn),
    noteOnMessage: (_id: string, count: number, ids?: string[], failed?: boolean) =>
      noted.push({ count, ids, failed }),
  };
  return { deps: deps as never as Parameters<typeof runMemoryExtraction>[1], payloads, noted, memoryData, patches };
}

const askConv = conv({
  messages: [
    { id: "u1", role: "user", content: "Qui dirige le projet côté client ?" },
    { id: "a1", role: "assistant", content: "D'après la page consultée, c'est Laurent Saint-Andiol." },
    { id: "u2", role: "user", content: "retiens tout ça dans ta mémoire" },
    { id: "a2", role: "assistant", content: "Noté." },
  ] as never,
});

const FACT_REPLY =
  '{"profil":null,"faits":[{"entite":"Laurent Saint-Andiol","alias":null,"cat":"personne","fait":"Dirige le projet côté client."}]}';

describe("runMemoryExtraction — la demande explicite lit la RÉPONSE de l'assistant", () => {
  it("le wire explicite inclut les tours assistant, étiquetés — et l'entité s'y ancre", async () => {
    const h = runDeps([FACT_REPLY]);
    const n = await runMemoryExtraction(askConv, h.deps, { explicit: true });
    expect(n).toBe(1);
    const wire = h.payloads[0].find((m) => m.role === "user")!.content;
    expect(wire).toContain("Assistant : D'après la page consultée, c'est Laurent Saint-Andiol.");
    expect(wire).toContain("Utilisateur : retiens tout ça dans ta mémoire");
    // The entity appears ONLY in the assistant's reply — the widened anchor keeps it.
    expect(h.memoryData[0].cards.map((c) => c.entity)).toEqual(["Laurent Saint-Andiol"]);
    expect(h.noted).toHaveLength(1);
    expect(h.noted[0].count).toBe(1);
    expect(h.noted[0].failed).toBeUndefined();
  });

  it("en mode SILENCIEUX la même entité (assistant-only) reste non ancrée → droppée", async () => {
    const h = runDeps([FACT_REPLY]);
    const silent = { ...askConv };
    const deps = h.deps as never as { settings: Settings };
    deps.settings = { memoryAuto: true, memoire: { cards: [] } as MemoryData } as Settings;
    const n = await runMemoryExtraction(silent, h.deps);
    expect(n).toBe(0);
    expect(h.memoryData).toEqual([]); // no write — the anti-hallucination holds
  });

  it("« sans mémoire ici » (memoryOff) coupe le silencieux — AUCUN appel modèle ; l'explicite reste honoré", async () => {
    const h = runDeps([FACT_REPLY]);
    const off = { ...askConv, memoryOff: true };
    const deps = h.deps as never as { settings: Settings };
    deps.settings = { memoryAuto: true, memoire: { cards: [] } as MemoryData } as Settings;
    expect(await runMemoryExtraction(off, h.deps)).toBe(0);
    expect(h.payloads).toEqual([]); // nothing goes out, not even the redacted slice
    // …but « retiens que… » is its own consent, memoryOff or not.
    const n = await runMemoryExtraction(off, h.deps, { explicit: true });
    expect(h.payloads.length).toBeGreaterThan(0);
    expect(n).toBeGreaterThanOrEqual(0);
  });
});

describe("runMemoryExtraction — une réponse illisible n'est pas « rien à retenir »", () => {
  it("relance UNE fois avec un correctif ; le 2e tour lisible sauve la mise", async () => {
    const h = runDeps(["Je réfléchis longuement, sans le moindre objet…", FACT_REPLY]);
    const n = await runMemoryExtraction(askConv, h.deps, { explicit: true });
    expect(n).toBe(1);
    expect(h.payloads).toHaveLength(2);
    const retry = h.payloads[1];
    expect(retry.at(-1)!.content).toContain("UNIQUEMENT l'objet JSON");
    expect(retry.some((m) => m.role === "assistant")).toBe(true); // the faulty reply in context
    expect(h.noted[0]).toMatchObject({ count: 1 });
  });

  it("deux réponses illisibles ⇒ watermark avancé (température 0 : reboucler ne paierait que le même échec) + échec SIGNALÉ", async () => {
    const h = runDeps(["blabla sans JSON"]);
    const n = await runMemoryExtraction(askConv, h.deps, { explicit: true });
    expect(n).toBe(0);
    expect(h.payloads).toHaveLength(2); // the call + its retry, never more
    expect(h.noted).toEqual([{ count: 0, ids: undefined, failed: true }]);
    const after = h.patches.reduce((c, fn) => fn(c), askConv);
    expect(after.memoryWatermark).toBe(askConv.messages.length);
  });

  it("modèle INJOIGNABLE + demande explicite ⇒ échec signalé, watermark PRÉSERVÉ (transitoire)", async () => {
    const h = runDeps([new Error("réseau")]);
    const n = await runMemoryExtraction(askConv, h.deps, { explicit: true });
    expect(n).toBe(0);
    expect(h.noted).toEqual([{ count: 0, ids: undefined, failed: true }]);
    // No watermark ADVANCE (a later retry keeps its chance) — the only patch
    // is the « Mise en mémoire… » notice set before the call (pinMemoryPending), which
    // the failure `noted` above then replaces.
    const after = h.patches.reduce((c, fn) => fn(c), askConv);
    expect(after.memoryWatermark).toBe(askConv.memoryWatermark);
    expect(after.messages.at(-1)?.memoryNotedPending).toBe(true);
  });
});

describe("useMemoryExtraction — blur-flush + balayage de démarrage", () => {
  it("un BLUR de fenêtre flushe la conversation active (l'utilisateur part)", async () => {
    const d = hookDeps();
    const h = await mountHook(d);
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(d.calls()).toBe(1);
    await h.unmount();
  });

  it("le blur respecte l'opt-out memoryAuto (pas d'appel silencieux)", async () => {
    const d = hookDeps({ settings: { memoryAuto: false } as Settings });
    const h = await mountHook(d);
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(d.calls()).toBe(0);
    await h.unmount();
  });

  it("le balayage traite les tranches orphelines après le délai — et une seule fois", async () => {
    const d = hookDeps({
      activeId: null, // nothing active: only the orphaned ones count
      conversations: [conv({ id: "o1" }), conv({ id: "o2", updatedAt: NOW - 5 })],
      sweepDelayMs: 30,
    });
    const h = await mountHook(d);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
    expect(d.calls()).toBe(2); // both orphans, in series
    await h.unmount();
  });
});
