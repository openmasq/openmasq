import { describe, it, expect } from "vitest";
import { toWinAnsi, pdfBytesFromBlocks, parseDataImage } from "./documentPdf";
import type { Block } from "./documentBlocks";

describe("toWinAnsi", () => {
  it("normalizes smart punctuation to ASCII", () => {
    expect(toWinAnsi("l’“été” — 5…")).toBe('l\'"été" - 5...');
  });

  it("keeps Latin-1 accents but drops emoji / CJK (unencodable)", () => {
    const out = toWinAnsi("Évreux ✅ 日本 çà");
    expect(out).toContain("Évreux");
    expect(out).toContain("çà");
    expect(out).not.toContain("✅");
    expect(out).not.toContain("日");
  });
});

describe("parseDataImage — what the fallback exporter can embed", () => {
  it("accepts PNG and JPEG, refuses everything else (pdf-lib supports only those two)", () => {
    expect(parseDataImage("data:image/png;base64,QUJD")?.mime).toBe("image/png");
    expect(parseDataImage("data:image/jpeg;base64,QUJD")?.mime).toBe("image/jpeg");
    expect(parseDataImage("data:image/png;base64,QUJD")?.bytes.length).toBe(3);
    // Skipped rather than thrown: a document must still export without its figure.
    expect(parseDataImage("data:image/webp;base64,QUJD")).toBeNull();
    expect(parseDataImage("data:image/svg+xml;base64,QUJD")).toBeNull();
    expect(parseDataImage("https://x.tld/a.png")).toBeNull();
    expect(parseDataImage("chart.png")).toBeNull();
  });
});

describe("pdfBytesFromBlocks", () => {
  it("still exports when a figure's format can't be embedded", async () => {
    const bytes = await pdfBytesFromBlocks(
      [
        { type: "image", src: "data:image/webp;base64,QUJD" },
        { type: "paragraph", runs: [{ text: "après" }] },
      ],
      "T",
    );
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("produces a real PDF (starts with %PDF-)", async () => {
    const blocks: Block[] = [
      { type: "heading", level: 1, runs: [{ text: "Titre" }] },
      { type: "paragraph", runs: [{ text: "Corps avec é à ç et " }, { text: "gras", bold: true }] },
      { type: "list", ordered: false, items: [[{ text: "un" }], [{ text: "deux" }]] },
    ];
    const bytes = await pdfBytesFromBlocks(blocks, "Titre");
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(300);
  });
});
