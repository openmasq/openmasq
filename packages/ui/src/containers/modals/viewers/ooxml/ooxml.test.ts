// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { emuToPx, halfPointsToPt, hundredthsToPt, twipsToPt } from "./units";
import { resolvePart, relsPathFor, openOoxml } from "./zip";
import { sniffImageMime, imageDataUri } from "./media";
import { parseClrScheme, parseClrMap, resolveColorEl, resolveDocxColor } from "./color";
import { parseXml, onOff, child, children, W, A } from "./xml";

const first = (xml: string): Element => parseXml(xml).documentElement;

describe("units — the twin-spelling trap", () => {
  // The whole reason this module exists: the two formats spell font size almost
  // identically and mean something different by a factor of 2. A 12pt docx run and a
  // 24pt pptx run are BOTH written "24"-ish.
  it("reads a docx <w:sz w:val='24'/> as 12pt (half-points)", () => {
    expect(halfPointsToPt(24)).toBe(12);
  });
  it("reads a pptx <a:rPr sz='2400'/> as 24pt (hundredths)", () => {
    expect(hundredthsToPt(2400)).toBe(24);
  });
  it("does not confuse the two", () => {
    expect(halfPointsToPt(2400)).not.toBe(hundredthsToPt(2400));
  });
  it("converts EMU per the DrawingML base (914400/inch, 96px/inch)", () => {
    expect(emuToPx(914400)).toBe(96);
    expect(emuToPx(0)).toBe(0);
  });
  it("reads twips as twentieths of a point", () => {
    expect(twipsToPt(240)).toBe(12);
  });
});

describe("zip — part path resolution", () => {
  it("resolves a rels target relative to the declaring part's folder", () => {
    expect(resolvePart("word", "media/image1.png")).toBe("word/media/image1.png");
  });
  it("walks ../ out of the part's folder (the pptx slide→media case)", () => {
    expect(resolvePart("ppt/slides", "../media/image1.png")).toBe("ppt/media/image1.png");
  });
  it("treats a leading / as package-root-relative, not folder-relative", () => {
    expect(resolvePart("ppt/slides", "/ppt/media/x.png")).toBe("ppt/media/x.png");
  });
  it("derives the _rels side-file path", () => {
    expect(relsPathFor("ppt/slides/slide1.xml")).toBe("ppt/slides/_rels/slide1.xml.rels");
    expect(relsPathFor("word/document.xml")).toBe("word/_rels/document.xml.rels");
  });
  it("orders numbered parts numerically, not lexically", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const files: Record<string, Uint8Array> = {};
    for (const n of [1, 2, 10]) files[`ppt/slides/slide${n}.xml`] = strToU8("<a/>");
    const pkg = await openOoxml(zipSync(files));
    // A plain sort gives slide1, slide10, slide2 — the deck would read out of order.
    expect(pkg.parts(/^ppt\/slides\/slide\d+\.xml$/)).toEqual([
      "ppt/slides/slide1.xml",
      "ppt/slides/slide2.xml",
      "ppt/slides/slide10.xml",
    ]);
  });
});

describe("zip — rels", () => {
  const build = async (relsXml: string) => {
    const { zipSync, strToU8 } = await import("fflate");
    return openOoxml(
      zipSync({
        "word/document.xml": strToU8("<a/>"),
        "word/_rels/document.xml.rels": strToU8(relsXml),
      }),
    );
  };
  const REL_NS = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';

  it("maps rId → resolved part path", async () => {
    const pkg = await build(
      `<Relationships ${REL_NS}><Relationship Id="rId4" Type="x" Target="media/img.png"/></Relationships>`,
    );
    expect(pkg.rels("word/document.xml").get("rId4")).toBe("word/media/img.png");
  });

  it("DROPS an External target — a crafted doc must not turn a preview into a request", async () => {
    const pkg = await build(
      `<Relationships ${REL_NS}>
         <Relationship Id="rId9" Type="x" Target="https://tracker.example/pixel.png" TargetMode="External"/>
       </Relationships>`,
    );
    expect(pkg.rels("word/document.xml").has("rId9")).toBe(false);
  });
});

describe("media — the allow-list is on the CONTENT, not the extension", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

  it("sniffs a real raster", () => {
    expect(sniffImageMime(png)).toBe("image/png");
    expect(sniffImageMime(gif)).toBe("image/gif");
  });

  it("REFUSES svg — the same policy the docx HTML sanitiser enforces (audit L14)", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    expect(sniffImageMime(svg)).toBeUndefined();
    expect(imageDataUri(svg)).toBeUndefined();
  });

  it("ignores a lying extension: the bytes decide", () => {
    // The filename lives inside the untrusted zip. `evil.png` holding SVG must not
    // become `data:image/png` — the old extension-keyed parser would have said png.
    const svgNamedPng = new TextEncoder().encode("<svg/>");
    expect(sniffImageMime(svgNamedPng)).toBeUndefined();
  });

  it("emits a data URI for an allow-listed raster", () => {
    expect(imageDataUri(png)?.startsWith("data:image/png;base64,")).toBe(true);
    expect(imageDataUri(new Uint8Array())).toBeUndefined();
  });
});

const THEME = `<a:theme xmlns:a="${A}"><a:themeElements><a:clrScheme name="Office">
  <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
  <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
  <a:dk2><a:srgbClr val="44546A"/></a:dk2>
  <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
</a:clrScheme></a:themeElements></a:theme>`;

describe("color — the theme chain", () => {
  const scheme = parseClrScheme(parseXml(THEME));

  it("parses both srgbClr and sysClr slots", () => {
    expect(scheme.dk1).toBe("000000");
    expect(scheme.lt1).toBe("ffffff");
    expect(scheme.accent1).toBe("4472c4");
  });

  it("resolves an explicit srgbClr", () => {
    expect(resolveColorEl(first(`<a:srgbClr xmlns:a="${A}" val="FF0000"/>`), scheme)).toBe("#ff0000");
  });

  it("resolves schemeClr THROUGH the master's clrMap — the link that silently breaks", () => {
    // A slide says tx1; only the master knows tx1 means dk1. Without the map the slot
    // misses and the text falls back to default ink — right often enough to hide it.
    const map = parseClrMap(first(`<p:clrMap xmlns:p="x" bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2"/>`));
    expect(map.tx1).toBe("dk1");
    expect(resolveColorEl(first(`<a:schemeClr xmlns:a="${A}" val="tx1"/>`), scheme, map)).toBe("#000000");
    expect(resolveColorEl(first(`<a:schemeClr xmlns:a="${A}" val="bg1"/>`), scheme, map)).toBe("#ffffff");
  });

  it("applies lumMod/lumOff", () => {
    const c = resolveColorEl(
      first(`<a:schemeClr xmlns:a="${A}" val="accent1"><a:lumMod val="50000"/></a:schemeClr>`),
      scheme,
    );
    expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(c).not.toBe("#4472c4"); // it moved
  });

  it("applies alpha as rgba", () => {
    const c = resolveColorEl(
      first(`<a:srgbClr xmlns:a="${A}" val="FF0000"><a:alpha val="50000"/></a:srgbClr>`),
      scheme,
    );
    expect(c).toBe("rgba(255, 0, 0, 0.5)");
  });

  it("allow-lists a prstClr name and rejects anything that could carry a declaration", () => {
    expect(resolveColorEl(first(`<a:prstClr xmlns:a="${A}" val="red"/>`), scheme)).toBe("red");
    expect(
      resolveColorEl(first(`<a:prstClr xmlns:a="${A}" val="red;background:url(x)"/>`), scheme),
    ).toBeUndefined();
  });

  it("returns undefined for an unknown slot instead of guessing", () => {
    expect(resolveColorEl(first(`<a:schemeClr xmlns:a="${A}" val="nope"/>`), scheme)).toBeUndefined();
  });
});

describe("color — docx spellings", () => {
  const scheme = parseClrScheme(parseXml(THEME));
  const wcolor = (a: string) => first(`<w:color xmlns:w="${W}" ${a}/>`);

  it("reads an explicit hex", () => {
    expect(resolveDocxColor(wcolor('w:val="FF0000"'), W, scheme)).toBe("#ff0000");
  });

  it("treats w:val='auto' as inherit, not as black", () => {
    expect(resolveDocxColor(wcolor('w:val="auto"'), W, scheme)).toBeUndefined();
  });

  it("maps docx's OWN theme slot names onto DrawingML's", () => {
    // docx says "text1" where DrawingML says "dk1" — the same colour, two vocabularies.
    expect(resolveDocxColor(wcolor('w:themeColor="text1"'), W, scheme)).toBe("#000000");
    expect(resolveDocxColor(wcolor('w:themeColor="accent1"'), W, scheme)).toBe("#4472c4");
  });

  it("reads themeShade as a HEX BYTE, not a percentage", () => {
    // DrawingML shade is thousandths of a percent; docx's is a hex byte. Same idea,
    // incompatible encodings — 0x80 is ~50%, not 0.8%.
    const c = resolveDocxColor(wcolor('w:themeColor="accent1" w:themeShade="80"'), W, scheme);
    expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(c).not.toBe("#4472c4");
  });
});

describe("xml — toggle semantics", () => {
  const rPr = (inner: string) => first(`<w:rPr xmlns:w="${W}">${inner}</w:rPr>`);

  it("reads a bare <w:b/> as on", () => {
    expect(onOff(child(rPr("<w:b/>"), W, "b"), W)).toBe(true);
  });

  it("reads <w:b w:val='0'/> as an explicit OFF, distinct from absent", () => {
    // This distinction is load-bearing: absent means "inherit from the style", while
    // val=0 means "the style said bold, this run says no". Collapsing them to a
    // boolean bolds every run that deliberately un-bolded itself.
    expect(onOff(child(rPr('<w:b w:val="0"/>'), W, "b"), W)).toBe(false);
    expect(onOff(child(rPr(""), W, "b"), W)).toBeUndefined();
  });

  it("finds direct children only — never a grandchild's property", () => {
    const p = first(`<w:p xmlns:w="${W}"><w:pPr><w:b/></w:pPr><w:r><w:t>x</w:t></w:r></w:p>`);
    // <w:b/> is inside <w:pPr>, not a child of <w:p> — a descendant walk would steal it.
    expect(children(p, W, "b")).toHaveLength(0);
    expect(children(p, W, "r")).toHaveLength(1);
  });
});
