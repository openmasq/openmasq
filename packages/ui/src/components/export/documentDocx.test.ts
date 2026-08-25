import { describe, it, expect } from "vitest";
import { documentXml, docxBytesFromBlocks } from "./documentDocx";
import type { Block } from "./documentBlocks";

const blocks: Block[] = [
  { type: "heading", level: 1, runs: [{ text: "Rapport & suite" }] },
  { type: "paragraph", runs: [{ text: "Gras", bold: true }, { text: " normal" }] },
  { type: "list", ordered: false, items: [[{ text: "un" }], [{ text: "deux" }]] },
];

describe("documentXml", () => {
  it("XML-escapes special chars in text", () => {
    const xml = documentXml([{ type: "paragraph", runs: [{ text: 'a & b < c > "d"' }] }]);
    expect(xml).toContain("a &amp; b &lt; c &gt; &quot;d&quot;");
  });

  it("makes headings bold with a size, and emits every run's text", () => {
    const xml = documentXml(blocks);
    expect(xml).toContain("<w:b/>");
    expect(xml).toContain('<w:sz w:val="44"/>');
    expect(xml).toContain("Rapport &amp; suite");
    expect(xml).toContain("un");
    expect(xml).toContain("deux");
    expect(xml).toContain("<w:sectPr>"); // valid body close
  });
});

describe("docxBytesFromBlocks", () => {
  it("produces a valid zip package with the document + content-types parts", async () => {
    const bytes = await docxBytesFromBlocks(blocks);
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K' — zip signature
    const { unzipSync, strFromU8 } = await import("fflate");
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toContain("word/document.xml");
    expect(Object.keys(files)).toContain("[Content_Types].xml");
    expect(Object.keys(files)).toContain("_rels/.rels");
    expect(strFromU8(files["word/document.xml"])).toContain("Rapport &amp; suite");
  });
});
