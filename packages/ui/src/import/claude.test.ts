import { describe, it, expect } from "vitest";
import { parseClaudeExport } from "./claude";

const FIXTURE = [
  {
    uuid: "u-1",
    name: "Plan de refonte",
    created_at: "2026-01-10T09:00:00.000Z",
    updated_at: "2026-01-10T09:05:00.000Z",
    chat_messages: [
      {
        uuid: "m1",
        sender: "human",
        created_at: "2026-01-10T09:00:00.000Z",
        content: [{ type: "text", text: "Aide-moi à planifier la refonte." }],
      },
      {
        uuid: "m2",
        sender: "assistant",
        created_at: "2026-01-10T09:01:00.000Z",
        // Legacy shape: no content blocks, just `text`.
        text: "Commençons par lister les écrans.",
      },
      // Non-text/unknown sender rows are dropped, never thrown on.
      { uuid: "m3", sender: "tool", text: "…" },
      { uuid: "m4", sender: "human", content: [{ type: "image" }] },
    ],
  },
];

describe("parseClaudeExport", () => {
  it("maps human/assistant text turns (blocks first, legacy text fallback)", () => {
    const convs = parseClaudeExport(FIXTURE, { modelId: "claude-opus-4-8" });
    expect(convs).toHaveLength(1);
    const c = convs[0];
    expect(c.id).toBe("imp-claude-u-1");
    expect(c.title).toBe("Plan de refonte");
    expect(c.createdAt).toBe(Date.parse("2026-01-10T09:00:00.000Z"));
    expect(c.updatedAt).toBe(Date.parse("2026-01-10T09:05:00.000Z"));
    expect(c.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(c.messages[0].content).toBe("Aide-moi à planifier la refonte.");
    expect(c.messages[1].content).toBe("Commençons par lister les écrans.");
  });

  it("skips malformed rows and empty conversations", () => {
    expect(parseClaudeExport(null, { modelId: "x" })).toEqual([]);
    expect(parseClaudeExport([{ uuid: "e", chat_messages: [] }], { modelId: "x" })).toEqual([]);
  });
});
