import { describe, expect, it } from "vitest";
import { checkExtracted, checkInplace } from "./extractAnswer";

const ok = { name: "a.pdf", kind: "pdf", text: "bonjour", chars: 7 };

describe("the worker's final answer is rebuilt, never passed on", () => {
  it("keeps the known fields of a document, with their geometry as plain data", () => {
    const file = { ...ok, error: "x", errorCode: "ocr_failed", errorParams: { pages: 2 }, blocked: true, mime: "application/pdf", ocrText: "b", words: [{ text: "b", x0: 0, y0: 0, x1: 1, y1: 1 }], ocr: { engine: "doctr", ms: 3 }, textPages: [{ text: "b", runs: [], boxes: [], width: 1, height: 1 }] };
    expect(checkExtracted(file)).toEqual(file);
  });

  it("drops what is not on the list: a path, an unknown field", () => {
    expect(checkExtracted({ ...ok, path: "/Users/a/.ssh/id_rsa", somethingElse: 1 })).toEqual(ok);
  });

  it("refuses an answer of the wrong shape, whole", () => {
    for (const bad of [null, "text", [], { ...ok, text: 1 }, { ...ok, chars: Number.NaN }, { ...ok, chars: -1 }, { ...ok, name: "n".repeat(5000) }, { ...ok, blocked: "yes" }, { ...ok, error: 3 }]) {
      expect(checkExtracted(bad)).toBeNull();
    }
  });

  it("refuses nested data that is not plain: a prototype key, an object of a class, a number that is not one, a depth past the bound", () => {
    expect(checkExtracted({ ...ok, words: [JSON.parse('{"__proto__":{"polluted":true}}')] })).toBeNull();
    expect(checkExtracted({ ...ok, words: [new Date()] })).toBeNull();
    expect(checkExtracted({ ...ok, ocr: { ms: Number.POSITIVE_INFINITY } })).toBeNull();
    let deep: unknown = 1;
    for (let i = 0; i < 20; i++) deep = [deep];
    expect(checkExtracted({ ...ok, words: deep })).toBeNull();
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("the in-place scrub's answer: bytes as base64 or null, string maps, spans", () => {
    const r = { scrubbed: "QUJD", vault: { "Jean Dupont": "PERSON_1" }, kinds: { "Jean Dupont": "person" }, spans: [{ value: "Jean Dupont", kind: "person" }] };
    expect(checkInplace({ ...r, more: 1 })).toEqual(r);
    expect(checkInplace({ ...r, scrubbed: null })?.scrubbed).toBeNull();
    for (const bad of [null, { ...r, scrubbed: 7 }, { ...r, vault: { a: 1 } }, { ...r, kinds: [] }, { ...r, spans: [{ value: 1, kind: "x" }] }, { ...r, spans: "x" }]) {
      expect(checkInplace(bad)).toBeNull();
    }
  });
});
