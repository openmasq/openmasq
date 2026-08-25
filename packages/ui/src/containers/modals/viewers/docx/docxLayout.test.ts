import { describe, it, expect } from "vitest";
import { groupBlocks, runCss, paraCss, listItemCss } from "./docxLayout";
import type { DocxBlock, DocxPara } from "./docxModel";

const para = (over: Partial<DocxPara> = {}): DocxPara => ({ kind: "para", inlines: [], ...over });

describe("groupBlocks", () => {
  it("collapses consecutive list paragraphs into ONE list", () => {
    // Word marks each paragraph with <w:numPr> and has no list element at all. One
    // <ul> per item would put a paragraph gap between every bullet.
    const blocks: DocxBlock[] = [
      para({ list: { level: 0, ordered: false } }),
      para({ list: { level: 0, ordered: false } }),
    ];
    const out = groupBlocks(blocks);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "list", ordered: false });
    expect((out[0] as any).items).toHaveLength(2);
  });

  it("does NOT merge a numbered list into a bulleted one", () => {
    const out = groupBlocks([
      para({ list: { level: 0, ordered: true } }),
      para({ list: { level: 0, ordered: false } }),
    ]);
    // Merging them would renumber the bullets as a continuation of the ordered list.
    expect(out).toHaveLength(2);
    expect((out[0] as any).ordered).toBe(true);
    expect((out[1] as any).ordered).toBe(false);
  });

  it("breaks a list when a plain paragraph interrupts it", () => {
    const out = groupBlocks([
      para({ list: { level: 0, ordered: false } }),
      para(),
      para({ list: { level: 0, ordered: false } }),
    ]);
    expect(out.map((b) => b.kind)).toEqual(["list", "para", "list"]);
  });

  it("passes tables through untouched", () => {
    const out = groupBlocks([{ kind: "table", rows: [] }]);
    expect(out).toEqual([{ kind: "table", rows: [] }]);
  });
});

describe("runCss", () => {
  it("maps caps to textTransform — never to an uppercased string", () => {
    expect(runCss({ caps: true }).textTransform).toBe("uppercase");
  });

  it("renders an explicit un-bold as weight 400, not as 'no rule'", () => {
    // The run says "not bold" against a bold style. Emitting nothing would let the
    // inherited bold win — the exact override the parser worked to preserve.
    expect(runCss({ bold: false }).fontWeight).toBe(400);
    expect(runCss({ bold: true }).fontWeight).toBe(700);
    expect(runCss({}).fontWeight).toBeUndefined();
  });

  it("combines underline and strike into ONE declaration", () => {
    // Two separate textDecoration assignments would overwrite each other and the run
    // would lose its underline.
    expect(runCss({ underline: true, strike: true }).textDecoration).toBe("underline line-through");
  });

  it("quotes a font family and strips characters that could break out of the value", () => {
    expect(runCss({ font: "Times New Roman" }).fontFamily).toBe('"Times New Roman", serif');
    expect(runCss({ font: 'Ev"il' }).fontFamily).toBe('"Evil", serif');
  });

  it("sizes a superscript relative to its own run", () => {
    expect(runCss({ vertAlign: "super", sizePt: 12 }).fontSize).toBe("9pt");
    expect(runCss({ vertAlign: "super" }).fontSize).toBe("0.75em");
  });
});

describe("paraCss / listItemCss", () => {
  it("emits the document's own spacing and alignment", () => {
    const css = paraCss(para({ align: "center", spaceBeforePt: 6, spaceAfterPt: 12, indentPx: 48 }));
    expect(css).toMatchObject({ textAlign: "center", marginTop: "6pt", marginBottom: "12pt", marginLeft: "48px" });
  });

  it("indents a nested list item by its level", () => {
    expect(listItemCss(para({ list: { level: 2, ordered: false } })).marginLeft).toBe("48px");
    expect(listItemCss(para({ list: { level: 0, ordered: false } })).marginLeft).toBeUndefined();
  });
});
