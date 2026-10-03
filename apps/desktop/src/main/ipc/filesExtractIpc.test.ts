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
  str: "str",
  optional: (c: unknown) => c,
}));
vi.mock("./readGate", () => ({ assertReadAllowed: () => {} }));
vi.mock("./registerFilesIpc", () => ({ progressTo: () => () => {} }));
const extractBytes = vi.fn();
vi.mock("../files", () => ({
  extractBytes: (...a: unknown[]) => extractBytes(...a),
  extractPaths: vi.fn(),
}));

import { registerExtractIpc, streamTo } from "./filesExtractIpc";

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

  // A document is attached WHOLE or not at all: a result that carries text AND a cause
  // (part of its pages) is a failure, never content handed on.
  it("an extraction carrying an error is rejected even WITH text", async () => {
    await expect(call({ text: "page 1", error: "page 2 illisible" })).rejects.toThrow(/page 2 illisible/);
  });

  it("a clean extraction carries no error and no blocked flag", async () => {
    await expect(call({ text: "ok", words: [{ w: 1 }] })).resolves.toEqual({
      text: "ok",
      words: [{ w: 1 }],
    });
  });
});

describe("files:extract-stream — the preview stream goes to the caller, tagged with ITS id", () => {
  const sender = () => {
    const sent: [string, unknown][] = [];
    return { sent, wc: { isDestroyed: () => false, send: (ch: string, p: unknown) => sent.push([ch, p]) } as never };
  };

  it("no id, or a malformed one ⇒ no stream at all", () => {
    const { wc } = sender();
    expect(streamTo(wc, undefined)).toBeUndefined();
    expect(streamTo(wc, "short")).toBeUndefined();
    expect(streamTo(wc, "../../etc/passwd-and-more")).toBeUndefined();
    expect(streamTo(wc, 42)).toBeUndefined();
  });

  it("an event is sent to that webContents only, with the id the preload filters on", () => {
    const { sent, wc } = sender();
    const s = streamTo(wc, "abcDEF123_-x")!;
    s({ page: { n: 1, total: 2, read: true, text: "p1" } }, { name: "a.pdf", path: "/x/a.pdf" });
    expect(sent).toEqual([
      ["files:extract-stream", { req: "abcDEF123_-x", name: "a.pdf", path: "/x/a.pdf", page: { n: 1, total: 2, read: true, text: "p1" } }],
    ]);
  });

  it("the bytes route forwards the id to the extraction only when it is well-formed", async () => {
    const fn = registered.get("files:extract-bytes")!;
    extractBytes.mockResolvedValueOnce({ text: "ok" });
    await fn({ sender: { isDestroyed: () => false, send: () => {} } }, { data: "eA==", name: "f.pdf", req: "bad id!" });
    expect(extractBytes.mock.calls.at(-1)?.[5]).toBeUndefined();
    extractBytes.mockResolvedValueOnce({ text: "ok" });
    await fn({ sender: { isDestroyed: () => false, send: () => {} } }, { data: "eA==", name: "f.pdf", req: "goodid12345" });
    expect(typeof extractBytes.mock.calls.at(-1)?.[5]).toBe("function");
  });
});
