// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { zipSync, unzipSync, strToU8 } from "fflate";
import { parseDocx } from "./parseDocx";
import type { DocxPara, DocxRun, DocxTable } from "./docxModel";

// The repo's two real .docx fixtures are Quartz-exported: no styles.xml, every
// property written directly on the run. They pin the "minimal producer" shape. The
// rest — inheritance, theme colours, lists, tables — is exercised on hand-authored
// OOXML, which lets each trap be stated as its own case instead of hoping a fixture
// happens to contain it.

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const THEME = `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:themeElements><a:clrScheme name="Office">
    <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
    <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
    <a:dk2><a:srgbClr val="44546A"/></a:dk2>
    <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
  </a:clrScheme></a:themeElements></a:theme>`;

function build(body: string, extra: Record<string, string> = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "word/document.xml": strToU8(`<w:document ${NS}><w:body>${body}</w:body></w:document>`),
    "word/theme/theme1.xml": strToU8(THEME),
  };
  for (const [k, v] of Object.entries(extra)) files[k] = strToU8(v);
  return zipSync(files);
}

const paras = (blocks: any[]): DocxPara[] => blocks.filter((b) => b.kind === "para");
const runs = (p: DocxPara): DocxRun[] => p.inlines.filter((i): i is DocxRun => i.kind === "run");
const text = (p: DocxPara): string => runs(p).map((r) => r.text).join("");

describe("parseDocx — direct run formatting", () => {
  it("reads bold, italic and colour off the run", async () => {
    const doc = await parseDocx(
      build(`<w:p><w:r><w:rPr><w:b/><w:i/><w:color w:val="FF0000"/></w:rPr><w:t>Bonjour</w:t></w:r></w:p>`),
    );
    const [r] = runs(paras(doc.blocks)[0]);
    expect(r.text).toBe("Bonjour");
    expect(r.bold).toBe(true);
    expect(r.italic).toBe(true);
    expect(r.color).toBe("#ff0000");
  });

  it("reads <w:sz> as HALF-points — a 24 is 12pt, not 24pt", async () => {
    const doc = await parseDocx(build(`<w:p><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>x</w:t></w:r></w:p>`));
    expect(runs(paras(doc.blocks)[0])[0].sizePt).toBe(12);
  });

  it("keeps <w:caps> as a flag and does NOT uppercase the text", async () => {
    // The string must stay the real string: a redaction matches BY VALUE, so an
    // eagerly uppercased "REBOUR" would no longer match the vault's "Rebour" and the
    // mark would vanish from the very view the user redacts in.
    const doc = await parseDocx(build(`<w:p><w:r><w:rPr><w:caps/></w:rPr><w:t>Rebour</w:t></w:r></w:p>`));
    const [r] = runs(paras(doc.blocks)[0]);
    expect(r.text).toBe("Rebour");
    expect(r.caps).toBe(true);
  });
});

describe("parseDocx — the inheritance chain", () => {
  const STYLES = `<w:styles ${NS}>
    <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
    <w:style w:styleId="Base"><w:name w:val="Base"/><w:rPr><w:b/><w:color w:val="00FF00"/></w:rPr></w:style>
    <w:style w:styleId="Child"><w:name w:val="Child"/><w:basedOn w:val="Base"/><w:rPr><w:i/></w:rPr></w:style>
    <w:style w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:sz w:val="48"/><w:color w:themeColor="accent1"/></w:rPr></w:style>
  </w:styles>`;

  it("applies docDefaults to a run that states nothing", async () => {
    const doc = await parseDocx(build(`<w:p><w:r><w:t>x</w:t></w:r></w:p>`, { "word/styles.xml": STYLES }));
    const [r] = runs(paras(doc.blocks)[0]);
    expect(r.font).toBe("Calibri");
    expect(r.sizePt).toBe(11);
  });

  it("walks basedOn root-first so a child style inherits its parent", async () => {
    const doc = await parseDocx(
      build(`<w:p><w:pPr><w:pStyle w:val="Child"/></w:pPr><w:r><w:t>x</w:t></w:r></w:p>`, {
        "word/styles.xml": STYLES,
      }),
    );
    const [r] = runs(paras(doc.blocks)[0]);
    expect(r.bold).toBe(true); // from Base
    expect(r.italic).toBe(true); // from Child
    expect(r.color).toBe("#00ff00"); // from Base
  });

  it("lets a run's DIRECT formatting override its style", async () => {
    const doc = await parseDocx(
      build(
        `<w:p><w:pPr><w:pStyle w:val="Base"/></w:pPr><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>x</w:t></w:r></w:p>`,
        { "word/styles.xml": STYLES },
      ),
    );
    // Base says bold; the run says NOT bold. An `undefined`-vs-`false` collapse here
    // would re-bold every run that deliberately un-bolds itself.
    expect(runs(paras(doc.blocks)[0])[0].bold).toBe(false);
  });

  it("recognises a heading style by its display name and resolves its theme colour", async () => {
    const doc = await parseDocx(
      build(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Titre</w:t></w:r></w:p>`, {
        "word/styles.xml": STYLES,
      }),
    );
    const p = paras(doc.blocks)[0];
    expect(p.headingLevel).toBe(1);
    expect(runs(p)[0].sizePt).toBe(24);
    expect(runs(p)[0].color).toBe("#4472c4"); // accent1 via the theme
  });

  it("survives a cyclic basedOn instead of hanging", async () => {
    const cyclic = `<w:styles ${NS}>
      <w:style w:styleId="A"><w:basedOn w:val="B"/><w:rPr><w:b/></w:rPr></w:style>
      <w:style w:styleId="B"><w:basedOn w:val="A"/><w:rPr><w:i/></w:rPr></w:style>
    </w:styles>`;
    const doc = await parseDocx(
      build(`<w:p><w:pPr><w:pStyle w:val="A"/></w:pPr><w:r><w:t>x</w:t></w:r></w:p>`, {
        "word/styles.xml": cyclic,
      }),
    );
    expect(runs(paras(doc.blocks)[0])[0].bold).toBe(true);
  });
});

describe("parseDocx — text integrity", () => {
  it("coalesces adjacent <w:t> nodes so a split value stays ONE run", async () => {
    // Word splits a word across runs for its own bookkeeping. A redaction matches by
    // value, so "Jean" + "-Rebour" must present as one string.
    const doc = await parseDocx(
      build(`<w:p><w:r><w:t>Jean</w:t></w:r><w:r><w:t>-Rebour</w:t></w:r></w:p>`),
    );
    expect(text(paras(doc.blocks)[0])).toBe("Jean-Rebour");
  });

  it("does NOT glue words across a <w:br/>", async () => {
    const doc = await parseDocx(build(`<w:p><w:r><w:t>a</w:t><w:br/><w:t>b</w:t></w:r></w:p>`));
    expect(text(paras(doc.blocks)[0])).toBe("a\nb");
  });

  it("preserves significant whitespace", async () => {
    const doc = await parseDocx(
      build(`<w:p><w:r><w:t xml:space="preserve">Jean </w:t></w:r><w:r><w:t>Rebour</w:t></w:r></w:p>`),
    );
    expect(text(paras(doc.blocks)[0])).toBe("Jean Rebour");
  });

  it("follows a hyperlink wrapper — its runs are real text", async () => {
    const doc = await parseDocx(
      build(`<w:p><w:hyperlink r:id="rId1"><w:r><w:t>contact@example.com</w:t></w:r></w:hyperlink></w:p>`),
    );
    expect(text(paras(doc.blocks)[0])).toBe("contact@example.com");
  });

  it("DROPS <w:del> text — it is not in the document", async () => {
    // Deleted tracked-change text must not render, and must not be selectable for
    // redaction either: it is not part of what the document says.
    const doc = await parseDocx(
      build(
        `<w:p><w:r><w:t>gardé</w:t></w:r><w:del><w:r><w:delText>supprimé</w:delText></w:r></w:del></w:p>`,
      ),
    );
    expect(text(paras(doc.blocks)[0])).toBe("gardé");
  });

  it("keeps <w:ins> text — an accepted insertion IS in the document", async () => {
    const doc = await parseDocx(build(`<w:p><w:ins><w:r><w:t>ajouté</w:t></w:r></w:ins></w:p>`));
    expect(text(paras(doc.blocks)[0])).toBe("ajouté");
  });
});

describe("parseDocx — blocks", () => {
  it("reads a table's cells as blocks, not flattened text", async () => {
    const doc = await parseDocx(
      build(
        `<w:tbl><w:tr>
           <w:tc><w:tcPr><w:shd w:fill="EEEEEE"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Nom</w:t></w:r></w:p></w:tc>
           <w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Rebour</w:t></w:r></w:p></w:tc>
         </w:tr></w:tbl>`,
      ),
    );
    const tbl = doc.blocks[0] as DocxTable;
    expect(tbl.kind).toBe("table");
    expect(tbl.rows).toHaveLength(1);
    expect(tbl.rows[0]).toHaveLength(2);
    expect(tbl.rows[0][0].background).toBe("#eeeeee");
    expect(tbl.rows[0][1].colSpan).toBe(2);
    const cell = tbl.rows[0][0].blocks[0] as DocxPara;
    expect(runs(cell)[0].bold).toBe(true); // styling survives into the cell
    expect(text(cell)).toBe("Nom");
  });

  it("marks a list item and reads its level + ordered-ness from numbering.xml", async () => {
    const numbering = `<w:numbering ${NS}>
      <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
      <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
      <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
      <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
    </w:numbering>`;
    const doc = await parseDocx(
      build(
        `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>un</w:t></w:r></w:p>
         <w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t>puce</w:t></w:r></w:p>`,
        { "word/numbering.xml": numbering },
      ),
    );
    const [a, b] = paras(doc.blocks);
    expect(a.list).toEqual({ level: 0, ordered: true }); // decimal → numbered
    expect(b.list).toEqual({ level: 1, ordered: false }); // bullet → unordered
  });

  it("reads alignment and the page body width", async () => {
    const doc = await parseDocx(
      build(
        `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>x</w:t></w:r></w:p>
         <w:sectPr><w:pgSz w:w="11906"/><w:pgMar w:left="1417" w:right="1417"/></w:sectPr>`,
      ),
    );
    expect(paras(doc.blocks)[0].align).toBe("center");
    // 11906 - 2*1417 twips → px. Just assert it is a sane page-ish width.
    expect(doc.bodyWidthPx).toBeGreaterThan(500);
    expect(doc.bodyWidthPx).toBeLessThan(800);
  });
});

describe("parseDocx — images", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const drawing = `<w:p><w:r><w:drawing>
      <wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
        <wp:extent cx="914400" cy="457200"/>
        <wp:docPr id="1" name="Image" descr="un logo"/>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:blip r:embed="rId5"/>
        </a:graphic>
      </wp:inline>
    </w:drawing></w:r></w:p>`;
  const rels = (target: string, mode = "") =>
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
       <Relationship Id="rId5" Type="x" Target="${target}" ${mode}/></Relationships>`;

  it("inlines an embedded raster as a data: URI with its EMU size in px", async () => {
    const files = build(drawing, { "word/_rels/document.xml.rels": rels("media/logo.png") });
    const zip = zipSync({ ...unzipAll(files), "word/media/logo.png": PNG });
    const doc = await parseDocx(zip);
    const img = paras(doc.blocks)[0].inlines[0];
    expect(img.kind).toBe("image");
    if (img.kind !== "image") throw new Error("expected an image");
    expect(img.src.startsWith("data:image/png;base64,")).toBe(true);
    expect(img.widthPx).toBe(96); // 914400 EMU = 1in = 96px
    expect(img.heightPx).toBe(48);
    expect(img.alt).toBe("un logo");
  });

  it("DROPS an image whose relationship is External — no outbound request from a preview", async () => {
    const files = build(drawing, {
      "word/_rels/document.xml.rels": rels("https://tracker.example/p.png", 'TargetMode="External"'),
    });
    const doc = await parseDocx(files);
    expect(paras(doc.blocks)[0].inlines).toHaveLength(0);
  });

  it("DROPS an image whose bytes are not an allow-listed raster", async () => {
    const files = build(drawing, { "word/_rels/document.xml.rels": rels("media/logo.png") });
    const zip = zipSync({ ...unzipAll(files), "word/media/logo.png": strToU8("<svg/>") });
    const doc = await parseDocx(zip);
    expect(paras(doc.blocks)[0].inlines).toHaveLength(0);
  });
});

/** Re-open a built zip so a test can add a binary part to it. */
function unzipAll(bytes: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(bytes);
}

describe("parseDocx — failure is loud", () => {
  it("throws on a zip that is not a .docx rather than returning an empty document", async () => {
    // An empty model would render as a blank page, which reads as "this document is
    // empty" — a claim about the file we have not earned.
    await expect(parseDocx(zipSync({ "hello.txt": strToU8("nope") }))).rejects.toThrow();
  });

  it("throws on malformed XML rather than rendering it as plain", async () => {
    await expect(parseDocx(zipSync({ "word/document.xml": strToU8("<w:document><oops>") }))).rejects.toThrow();
  });
});

describe("parseDocx — the real fixtures (Quartz-exported, no styles.xml)", () => {
  // `fileURLToPath` on the URL STRING, not `new URL(...)`: under jsdom the global URL
  // is jsdom's, which node:fs does not accept as a path (it stringifies to nonsense).
  const HERE = dirname(fileURLToPath(import.meta.url));
  const fixture = (name: string) =>
    new Uint8Array(readFileSync(resolve(HERE, "../../../../../../redact/src/__fixtures__", name)));

  it("parses nda-contract.docx: direct formatting, no styles part", async () => {
    const doc = await parseDocx(fixture("nda-contract.docx"));
    const ps = paras(doc.blocks);
    expect(ps.length).toBeGreaterThan(3);
    const all = ps.map(text).join("\n");
    expect(all.length).toBeGreaterThan(100);
    // The exporter writes Times/sz/b directly on every run — the shape that has no
    // styles.xml to inherit from.
    const styled = ps.flatMap(runs).filter((r) => r.font === "Times");
    expect(styled.length).toBeGreaterThan(0);
    expect(ps.flatMap(runs).some((r) => r.bold)).toBe(true);
    expect(ps.flatMap(runs).some((r) => r.sizePt === 24)).toBe(true); // <w:sz w:val="48"/>
  });

  it("parses sample.docx", async () => {
    const doc = await parseDocx(fixture("sample.docx"));
    expect(paras(doc.blocks).map(text).join("").length).toBeGreaterThan(20);
  });
});
