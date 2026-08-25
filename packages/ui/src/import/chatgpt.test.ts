import { describe, it, expect } from "vitest";
import { parseChatGptExport } from "./chatgpt";

/** Minimal export fixture: root → user → assistant, plus a forked (abandoned) branch
 *  and a hidden system node — only the active chain's real turns must survive. */
const FIXTURE = [
  {
    conversation_id: "abc-123",
    title: "Recette de crêpes",
    create_time: 1700000000,
    update_time: 1700000100,
    current_node: "n3",
    mapping: {
      root: { id: "root", parent: null, message: null },
      n0: {
        id: "n0",
        parent: "root",
        message: {
          author: { role: "system" },
          content: { content_type: "text", parts: [""] },
          metadata: { is_visually_hidden_from_conversation: true },
        },
      },
      n1: {
        id: "n1",
        parent: "n0",
        message: {
          author: { role: "user" },
          create_time: 1700000010,
          content: { content_type: "text", parts: ["Comment faire des crêpes ?"] },
        },
      },
      // Abandoned regeneration branch — NOT on the current_node chain.
      n2a: {
        id: "n2a",
        parent: "n1",
        message: {
          author: { role: "assistant" },
          content: { content_type: "text", parts: ["Vieille réponse abandonnée"] },
        },
      },
      n3: {
        id: "n3",
        parent: "n1",
        message: {
          author: { role: "assistant" },
          create_time: 1700000020,
          content: { content_type: "multimodal_text", parts: ["Mélangez la farine…", { image: true }] },
        },
      },
    },
  },
];

describe("parseChatGptExport", () => {
  it("walks the active branch only, drops hidden/system nodes, converts timestamps to ms", () => {
    const convs = parseChatGptExport(FIXTURE, { modelId: "gpt-5.5" });
    expect(convs).toHaveLength(1);
    const c = convs[0];
    expect(c.id).toBe("imp-gpt-abc-123");
    expect(c.title).toBe("Recette de crêpes");
    expect(c.modelId).toBe("gpt-5.5");
    expect(c.createdAt).toBe(1700000000000);
    expect(c.updatedAt).toBe(1700000100000);
    expect(c.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(c.messages[0].content).toBe("Comment faire des crêpes ?");
    // multimodal: string parts kept, image objects dropped
    expect(c.messages[1].content).toBe("Mélangez la farine…");
    expect(c.messages[1].at).toBe(1700000020000);
    // The abandoned branch never appears.
    expect(c.messages.some((m) => m.content.includes("abandonnée"))).toBe(false);
  });

  it("skips empty/unknown conversations instead of throwing", () => {
    expect(parseChatGptExport(null, { modelId: "x" })).toEqual([]);
    expect(parseChatGptExport([{}, { conversation_id: "z", mapping: {} }], { modelId: "x" })).toEqual([]);
  });

  it("mints stable ids so a re-import dedupes", () => {
    const a = parseChatGptExport(FIXTURE, { modelId: "x" })[0].id;
    const b = parseChatGptExport(FIXTURE, { modelId: "x" })[0].id;
    expect(a).toBe(b);
  });
});
