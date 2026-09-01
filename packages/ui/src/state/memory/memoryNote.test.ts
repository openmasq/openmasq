import { describe, it, expect } from "vitest";
import { pinMemoryNote, pinMemoryPending } from "./memoryNote";
import type { Conversation } from "../../types";

const conv = (): Conversation =>
  ({
    id: "c1",
    title: "t",
    modelId: "m",
    createdAt: 0,
    updatedAt: 0,
    messages: [
      { id: "u1", role: "user", content: "retiens que…" },
      { id: "a1", role: "assistant", content: "Noté." },
    ],
  }) as Conversation;

describe("pinMemoryPending / pinMemoryNote — « Mise en mémoire… » puis le résultat", () => {
  it("pose l'état en cours sur la dernière réponse posée (jamais une pending)", () => {
    const out = pinMemoryPending(conv());
    expect(out.messages[1].memoryNotedPending).toBe(true);
    expect(out.messages[0].memoryNotedPending).toBeUndefined();
  });

  it("le résultat REMPLACE l'état en cours — jamais les deux légendes à la fois", () => {
    const noted = pinMemoryNote(pinMemoryPending(conv()), 2, ["id1"]);
    expect(noted.messages[1].memoryNoted).toBe(2);
    expect(noted.messages[1].memoryNotedPending).toBeUndefined();
  });

  it("un échec réel remplace aussi l'état en cours (« réessayez », pas un sablier figé)", () => {
    const failed = pinMemoryNote(pinMemoryPending(conv()), 0, undefined, true);
    expect(failed.messages[1].memoryNotedFailed).toBe(true);
    expect(failed.messages[1].memoryNotedPending).toBeUndefined();
  });

  it("sans réponse posée, rien à épingler — la conversation ressort intacte", () => {
    const c = { ...conv(), messages: [{ id: "u1", role: "user", content: "retiens" }] } as Conversation;
    expect(pinMemoryPending(c)).toBe(c);
  });
});
