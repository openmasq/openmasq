// What this pins: the bytes route tells a guard REFUSAL apart from a parser failure. A
// refused archive (zip bomb, oversized image) used to reach the renderer as a generic
// throw — which the renderer treats as "the parser could not read it" and KEEPS the bytes
// for the preview, where an unguarded `unzipSync` then inflated the bomb (audit 04/09).
import { describe, it, expect, vi, beforeEach } from "vitest";

const registered = new Map<string, (e: unknown, raw: unknown) => unknown>();
vi.mock("./handle", () => ({
  handle: (ch: string, _shape: unknown, fn: (e: unknown, raw: unknown) => unknown) =>
    registered.set(ch, fn),
  arr: "arr",
  obj: "obj",
}));
vi.mock("./readGate", () => ({ assertReadAllowed: () => {} }));
vi.mock("./registerFilesIpc", () => ({ progressTo: () => () => {} }));
const extractBytes = vi.fn();
vi.mock("../files", () => ({
  extractBytes: (...a: unknown[]) => extractBytes(...a),
  extractPaths: vi.fn(),
}));

import { registerExtractIpc } from "./filesExtractIpc";

const call = (out: Record<string, unknown>) => {
  extractBytes.mockResolvedValueOnce(out);
  const fn = registered.get("files:extract-bytes")!;
  return fn({ sender: {} }, { data: Buffer.from("x").toString("base64"), name: "f.docx" });
};

describe("files:extract-bytes — refusal vs failure", () => {
  beforeEach(() => {
    registered.clear();
    registerExtractIpc();
  });

  it("a guard REFUSAL returns `blocked` (no throw) so the renderer drops the bytes", async () => {
    await expect(call({ text: "", error: "Archive refusée", blocked: true })).resolves.toEqual({
      text: "",
      error: "Archive refusée",
      blocked: true,
    });
  });

  it("a TOTAL parser failure still rejects", async () => {
    await expect(call({ text: "  ", error: "illisible" })).rejects.toThrow(/illisible/);
  });

  it("a PARTIAL extraction returns its text AND the cause", async () => {
    await expect(call({ text: "page 1", error: "page 2 illisible" })).resolves.toEqual({
      text: "page 1",
      error: "page 2 illisible",
    });
  });

  it("a clean extraction carries no error and no blocked flag", async () => {
    await expect(call({ text: "ok", words: [{ w: 1 }] })).resolves.toEqual({
      text: "ok",
      words: [{ w: 1 }],
    });
  });
});
