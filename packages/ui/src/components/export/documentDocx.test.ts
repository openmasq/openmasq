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

describe("document fonts", () => {
  it("declares Aptos as the default face on every script slot, at 11 pt", async () => {
    const { unzipSync, strFromU8 } = await import("fflate");
    const files = unzipSync(await docxBytesFromBlocks(blocks));
    const styles = strFromU8(files["word/styles.xml"]);
    expect(styles).toContain("<w:docDefaults>");
    expect(styles).toContain('<w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Aptos" w:cs="Aptos"/>');
    expect(styles).toContain('<w:sz w:val="22"/>');
  });

  it("names Calibri as Aptos's substitute in the font table, and keeps Consolas for code", async () => {
    const { unzipSync, strFromU8 } = await import("fflate");
    const files = unzipSync(await docxBytesFromBlocks(blocks));
    const table = strFromU8(files["word/fontTable.xml"]);
    expect(table).toMatch(/<w:font w:name="Aptos"><w:altName w:val="Calibri"\/>.*?<w:family w:val="swiss"\/>/);
    expect(table).toContain('<w:font w:name="Consolas">');
  });

  it("registers both parts: content types and the main part's relationships", async () => {
    const { unzipSync, strFromU8 } = await import("fflate");
    const files = unzipSync(await docxBytesFromBlocks(blocks));
    const types = strFromU8(files["[Content_Types].xml"]);
    expect(types).toContain('PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"');
    expect(types).toContain('PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"');
    const rels = strFromU8(files["word/_rels/document.xml.rels"]);
    expect(rels).toContain('relationships/styles" Target="styles.xml"');
    expect(rels).toContain('relationships/fontTable" Target="fontTable.xml"');
  });

  it("keeps code listings tight (no paragraph gap between lines)", () => {
    const xml = documentXml([{ type: "code", text: "a\nb" }]);
    expect(xml.match(/<w:spacing w:after="0"/g)).toHaveLength(2);
  });
});
