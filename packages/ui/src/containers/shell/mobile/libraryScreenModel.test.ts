import { describe, expect, it } from "vitest";
import { fileMetaLine, segmentOf, splitBySegment } from "./libraryScreenModel";
import type { LibFile } from "../../../pages/Library";

const mk = (over: Partial<LibFile>): LibFile => ({
  id: "f1",
  name: "contrat.pdf",
  mime: "application/pdf",
  redacted: false,
  createdAt: Date.now(),
  conversationId: "c1",
  conversationTitle: "Conv",
  kind: "document",
  ...over,
});

describe("mobile library segments", () => {
  it("puts tableurs and audio with the FILES, not the images", () => {
    // The desktop's five tabs collapse to two here; the trap is silently dropping a
    // kind (a `kind === 'document'` test would hide every .xlsx and .m4a).
    expect(segmentOf(mk({ kind: "sheet" }))).toBe("files");
    expect(segmentOf(mk({ kind: "audio" }))).toBe("files");
    expect(segmentOf(mk({ kind: "document" }))).toBe("files");
    expect(segmentOf(mk({ kind: "image" }))).toBe("images");
  });

  it("splits one listing into both buckets without losing or reordering a file", () => {
    const list = [
      mk({ id: "a", kind: "document" }),
      mk({ id: "b", kind: "image" }),
      mk({ id: "c", kind: "sheet" }),
      mk({ id: "d", kind: "image" }),
    ];
    const out = splitBySegment(list);
    expect(out.files.map((f) => f.id)).toEqual(["a", "c"]);
    expect(out.images.map((f) => f.id)).toEqual(["b", "d"]);
    expect(out.files.length + out.images.length).toBe(list.length);
  });
});

describe("fileMetaLine", () => {
  it("states the extension and the date — never a size we do not have", () => {
    const line = fileMetaLine(mk({ name: "contrat.pdf", createdAt: Date.now() }));
    expect(line).toBe("PDF · Aujourd'hui");
    // FileMeta has no byte size; nothing in the line may imply one.
    expect(line).not.toMatch(/o\b|Mo|Ko/);
  });

  it("degrades to one fact, or none, rather than printing a placeholder", () => {
    expect(fileMetaLine(mk({ name: "sans-extension", createdAt: Date.now() }))).toBe("Aujourd'hui");
    expect(fileMetaLine(mk({ name: "sans-extension", createdAt: 0 }))).toBe("");
    // An unusable timestamp must never surface as "Invalid Date".
    expect(fileMetaLine(mk({ name: "x.csv", createdAt: Number.NaN }))).toBe("CSV");
  });
});
