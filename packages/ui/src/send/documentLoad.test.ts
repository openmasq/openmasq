import { describe, expect, it } from "vitest";
import type { Message } from "../types";
import { AUTO_MODEL_ID } from "./autoRoute";
import { DOC_WEIGHT_NOTICE_SHARE, documentWeight, droppedDocumentNames, flagClipped } from "./documentLoad";
import { buildFoldedPayload, MAX_FILE_CHARS } from "./foldPayload";
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

describe("flagClipped — the sent card says when the wire cut a document", () => {
  const long = "ligne\n".repeat(MAX_FILE_CHARS / 3);
  const entries = [
    { name: "long.txt", kind: "txt" },
    { name: "court.txt", kind: "txt" },
    { name: "scan.pdf", kind: "pdf" },
  ];
  const files = [
    { name: "long.txt", text: long },
    { name: "court.txt", text: "bref" },
    { name: "scan.pdf", text: long },
  ];

  it("flags exactly the documents the fold clipped, never one sent as page images", () => {
    const out = flagClipped(entries, files, ["scan.pdf"]);
    expect(out?.map((a) => !!(a as { clipped?: boolean }).clipped)).toEqual([true, false, false]);
    // Same verdict as the wire itself: the fold marks the cut it made.
    expect(buildFoldedPayload("q", [files[0]], {}, "").modelText).toContain("…(truncated)");
    expect(buildFoldedPayload("q", [files[1]], {}, "").modelText).not.toContain("…(truncated)");
  });

  it("returns the entries untouched when nothing was cut", () => {
    const small = [entries[1]];
    expect(flagClipped(small, [files[1]], undefined)).toBe(small);
    expect(flagClipped(undefined, files, undefined)).toBeUndefined();
  });
});
