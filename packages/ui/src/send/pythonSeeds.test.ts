import { describe, it, expect } from "vitest";
import { loadPythonSeeds } from "./pythonSeeds";

const toBase64 = (b: Uint8Array): string => Buffer.from(b).toString("base64");
const bytes = (s: string): Uint8Array => new Uint8Array(Buffer.from(s));

const assistantWith = (...names: string[]) => ({
  role: "assistant",
  attachments: names.map((name) => ({ name, kind: "file" })),
});

describe("loadPythonSeeds", () => {
  it("loads a prior deliverable's REAL bytes from the DB, picking the NEWEST row of a re-generated name", async () => {
    const seeds = await loadPythonSeeds({
      listFiles: async () => [
        { id: "old", name: "rapport.pdf", createdAt: 1 },
        { id: "new", name: "rapport.pdf", createdAt: 2 },
      ],
      loadFile: async (id) => ({ original: bytes(id === "new" ? "v2" : "v1") }),
      toBase64,
      conversationId: "c1",
      messages: [assistantWith("rapport.pdf")],
      turnFiles: [],
    });
    expect(seeds).toEqual([{ name: "rapport.pdf", base64: toBase64(bytes("v2")) }]);
  });

  it("this TURN's fresh version of a name wins over the DB row", async () => {
    const seeds = await loadPythonSeeds({
      listFiles: async () => [{ id: "db", name: "a.xlsx", createdAt: 1 }],
      loadFile: async () => ({ original: bytes("stale") }),
      toBase64,
      conversationId: "c1",
      messages: [assistantWith("a.xlsx")],
      turnFiles: [{ name: "a.xlsx", base64: "FRESH" }],
    });
    expect(seeds).toEqual([{ name: "a.xlsx", base64: "FRESH" }]);
  });

  it("is best-effort: a throwing DB seeds only the turn files, never an error", async () => {
    const seeds = await loadPythonSeeds({
      listFiles: async () => {
        throw new Error("db down");
      },
      loadFile: async () => {
        throw new Error("db down");
      },
      toBase64,
      conversationId: "c1",
      messages: [assistantWith("a.pdf")],
      turnFiles: [{ name: "b.pptx", base64: "B" }],
    });
    expect(seeds).toEqual([{ name: "b.pptx", base64: "B" }]);
  });

  it("no DB host → still seeds this turn's files (mobile/preview shape)", async () => {
    const seeds = await loadPythonSeeds({
      toBase64,
      conversationId: null,
      messages: [assistantWith("a.pdf")],
      turnFiles: [{ name: "a.pdf", base64: "T" }],
    });
    expect(seeds).toEqual([{ name: "a.pdf", base64: "T" }]);
  });
});
