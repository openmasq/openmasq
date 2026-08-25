import { describe, it, expect, vi } from "vitest";
import type { Conversation, Settings } from "../types";
import { COMPACT_IDLE_MS, runContextCompaction, type ContextCompactionDeps } from "./useContextCompaction";
import { COMPACT_MIN_TURNS } from "../send/contextSummary";

const RECAP = "- Objectif : migrer le CRM de Louis Terral\n- Contrainte : pas de coupure de service";

function conversation(turns: number, over: Partial<Conversation> = {}): Conversation {
  return {
    id: "c1",
    title: "t",
    createdAt: 0,
    updatedAt: 0,
    modelId: "gpt-5.5",
    messages: Array.from({ length: turns }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? "user" : "assistant",
      content: `tour ${i} à propos de Louis Terral`,
    })),
    ...over,
  } as unknown as Conversation;
}

function deps(over: Partial<ContextCompactionDeps> = {}): ContextCompactionDeps & {
  patched: Conversation[];
} {
  const patched: Conversation[] = [];
  return {
    conversations: [],
    activeId: "c1",
    settings: { defaultModelId: "gpt-5.5" } as unknown as Settings,
    complete: vi.fn(async () => RECAP),
    patchConversation: (_id, fn) => {
      patched.push(fn(conversation(0)));
    },
    patched,
    ...over,
  } as ContextCompactionDeps & { patched: Conversation[] };
}

describe("runContextCompaction", () => {
  it("does nothing on a short conversation", async () => {
    const d = deps();
    expect(await runContextCompaction(conversation(COMPACT_MIN_TURNS - 2), d)).toBe(false);
    expect(d.complete).not.toHaveBeenCalled();
  });

  it("summarises a long one and stores the recap with its coverage", async () => {
    const d = deps();
    expect(await runContextCompaction(conversation(60), d)).toBe(true);
    const stored = d.patched[0]!.contextSummary!;
    expect(stored.text).toBe(RECAP);
    expect(stored.throughTurn).toBeGreaterThan(0);
    expect(stored.throughTurn).toBeLessThan(60);
    expect(stored.model).toBe("gpt-5.5");
  });

  it("sends the WIRE turns — a vaulted real value never reaches the summariser", async () => {
    // The egress claim of the whole feature: the pass reads what the model already saw.
    const complete = vi.fn(async (_payload: { messages: { content: string }[] }) => RECAP);
    const conv = conversation(60, {
      redactionVault: { "Louis Terral": "Louis Terral" } as never,
    });
    // Store the REAL value in the messages, vault it to a fake, and assert the fake goes out.
    const real = "Marc Brivet";
    conv.messages = conv.messages.map((m) => ({ ...m, content: m.content.replace("Louis Terral", real) }));
    (conv as { redactionVault?: Record<string, string> }).redactionVault = { "Louis Terral": real };

    await runContextCompaction(conv, deps({ complete: complete as never }));
    const sent = complete.mock.calls[0]![0];
    expect(sent.messages[0]!.content).toContain("Louis Terral");
    expect(sent.messages[0]!.content).not.toContain(real);
  });

  it("keeps the previous recap when the model is unreachable — never a blank summary", async () => {
    const d = deps({
      complete: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    expect(await runContextCompaction(conversation(60), d)).toBe(false);
    expect(d.patched).toHaveLength(0);
  });

  it("refuses an unusable reply rather than storing an empty recap", async () => {
    const d = deps({ complete: vi.fn(async () => "ok") });
    expect(await runContextCompaction(conversation(60), d)).toBe(false);
    expect(d.patched).toHaveLength(0);
  });

  it("no-ops without a complete host (browser preview) instead of throwing", async () => {
    const d = deps({ complete: undefined });
    expect(await runContextCompaction(conversation(60), d)).toBe(false);
  });

  it("waits out a courtesy delay before running at all", () => {
    // Pinned so a future edit cannot silently make this fire on every settled turn.
    expect(COMPACT_IDLE_MS).toBeGreaterThanOrEqual(60_000);
  });
});
