import { describe, expect, it } from "vitest";
import type { Message } from "../types";
import { AUTO_MODEL_ID } from "./autoRoute";
import { DOC_WEIGHT_NOTICE_SHARE, documentWeight, droppedDocumentNames } from "./documentLoad";
import { fitHistoryToContext } from "./historyWindow";

const user = (id: string, content: string, docs: string[] = [], docChars = 0): Message =>
  ({
    id,
    role: "user",
    content,
    ...(docs.length ? { attachments: docs.map((name) => ({ name, kind: "pdf" })) } : {}),
    ...(docs.length && docChars ? { modelContent: content + "x".repeat(docChars) } : {}),
  }) as Message;
const reply = (id: string): Message => ({ id, role: "assistant", content: "ok" }) as Message;

describe("documentWeight — the composer's « documents occupy N % » notice", () => {
  // gpt-4o: 128K tokens → 512K chars at the shared chars/4.
  it("speaks from half the window, counting only the documents' share of `modelContent`", () => {
    const half = 128_000 * 4 * DOC_WEIGHT_NOTICE_SHARE;
    expect(documentWeight({ modelId: "gpt-4o", messages: [user("u1", "q", ["a.pdf"], half - 100)] })).toBeNull();
    const w = documentWeight({
      modelId: "gpt-4o",
      messages: [user("u1", "q", ["a.pdf"], half / 2), reply("a1"), user("u2", "q", ["b.pdf"], half / 2)],
    });
    expect(w?.share).toBeCloseTo(DOC_WEIGHT_NOTICE_SHARE, 2);
    expect(w?.limit).toBe(128_000);
  });

  it("a turn whose documents are not re-sent (no `modelContent`) weighs nothing", () => {
    const m = user("u1", "q", ["a.pdf"]);
    expect(documentWeight({ modelId: "gpt-4o", messages: [m] })).toBeNull();
  });

  it("stays silent for Auto and for a model with no known window", () => {
    const heavy = [user("u1", "q", ["a.pdf"], 2_000_000)];
    expect(documentWeight({ modelId: AUTO_MODEL_ID, messages: heavy })).toBeNull();
    expect(documentWeight({ modelId: "some-local-model", messages: heavy })).toBeNull();
    expect(documentWeight({ modelId: undefined, messages: heavy })).toBeNull();
  });
});

describe("droppedDocumentNames — the documents the history window stopped sending", () => {
  it("names the documents of exactly the turns `fitHistoryToContext` dropped", () => {
    const prior = [
      user("u1", "q1", ["contrat.pdf"], 300_000),
      reply("a1"),
      user("u2", "q2", ["annexe.docx"], 300_000),
      reply("a2"),
    ];
    const wire = [
      { role: "system" as const, content: "sys" },
      ...prior.map((m) => ({ role: m.role, content: m.modelContent ?? m.content })),
      { role: "user" as const, content: "q3" },
    ];
    const { dropped } = fitHistoryToContext(wire, { contextTokens: 128_000 });
    expect(dropped).toBe(2);
    expect(droppedDocumentNames(prior, dropped)).toEqual(["contrat.pdf"]);
  });

  it("a document attached again in a KEPT turn is still in front of the model", () => {
    const prior = [user("u1", "q", ["a.pdf", "b.pdf"], 10), reply("a1"), user("u2", "q", ["a.pdf"], 10)];
    expect(droppedDocumentNames(prior, 2)).toEqual(["b.pdf"]);
  });

  it("nothing dropped, or a dropped turn that re-sent no document, names nothing", () => {
    expect(droppedDocumentNames([user("u1", "q", ["a.pdf"], 10)], 0)).toEqual([]);
    expect(droppedDocumentNames([user("u1", "q", ["a.pdf"]), reply("a1")], 2)).toEqual([]);
  });
});
