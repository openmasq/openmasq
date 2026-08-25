import { describe, expect, it } from "vitest";
import { memoryUsageIndex } from "./usage";
import type { Conversation } from "../types";

const conv = (id: string, messages: Conversation["messages"], updatedAt = 0): Conversation =>
  ({ id, title: id, messages, updatedAt } as unknown as Conversation);

describe("memoryUsageIndex — where a card served, from the persisted traces", () => {
  it("counts DISTINCT conversations and keeps the most recent injection", () => {
    const idx = memoryUsageIndex([
      conv("c1", [
        { id: "m1", role: "user", content: "", at: 100, memoryUsed: ["k1"] },
        { id: "m2", role: "user", content: "", at: 200, memoryUsed: ["k1"] },
      ] as Conversation["messages"]),
      conv("c2", [
        { id: "m3", role: "user", content: "", at: 150, memoryUsed: ["k1", "k2"] },
      ] as Conversation["messages"]),
    ]);
    expect(idx.get("k1")).toMatchObject({ convCount: 2, lastAt: 200 });
    expect(idx.get("k2")).toMatchObject({ convCount: 1, lastAt: 150 });
  });

  it("the profile sentinel is not a card and never counts", () => {
    const idx = memoryUsageIndex([
      conv("c1", [
        { id: "m1", role: "user", content: "", at: 1, memoryUsed: ["profile"] },
      ] as Conversation["messages"]),
    ]);
    expect(idx.size).toBe(0);
  });

  it("a skip NEWER than the last recall is surfaced; an older one is superseded noise", () => {
    const idx = memoryUsageIndex([
      conv("c1", [
        { id: "m1", role: "user", content: "", at: 100, memorySkipped: [{ id: "k1", reason: "budget" }] },
        { id: "m2", role: "user", content: "", at: 200, memoryUsed: ["k1"] },
        { id: "m3", role: "user", content: "", at: 300, memorySkipped: [{ id: "k1", reason: "homographe" }] },
      ] as Conversation["messages"]),
    ]);
    expect(idx.get("k1")).toMatchObject({
      convCount: 1,
      lastAt: 200,
      lastSkip: { reason: "homographe", at: 300 },
    });
  });

  it("a never-recalled card with a skip still gets a diagnosable entry", () => {
    const idx = memoryUsageIndex([
      conv("c1", [
        { id: "m1", role: "user", content: "", at: 50, memorySkipped: [{ id: "k9", reason: "homographe" }] },
      ] as Conversation["messages"]),
    ]);
    expect(idx.get("k9")).toMatchObject({ convCount: 0, lastSkip: { reason: "homographe" } });
  });

  it("a message with no `at` falls back to the conversation clock", () => {
    const idx = memoryUsageIndex([
      conv("c1", [{ id: "m1", role: "user", content: "", memoryUsed: ["k1"] }] as Conversation["messages"], 777),
    ]);
    expect(idx.get("k1")?.lastAt).toBe(777);
  });
});
