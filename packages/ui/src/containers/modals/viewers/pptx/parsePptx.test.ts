// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { parsePptx } from "./parsePptx";
import type { PptxTextShape, PptxImageShape } from "./pptxModel";

// There is no .pptx fixture in the repo, and a single one could not exercise this
// anyway: the point of the parser is the slide → layout → master → theme chain, and
// each link fails DIFFERENTLY. So each package here is hand-authored to omit exactly
// one thing and prove where the value comes from instead.

const NS =
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const REL_NS = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
const rel = (id: string, target: string, mode = "") =>
  `<Relationship Id="${id}" Type="x" Target="${target}" ${mode}/>`;
const rels = (...r: string[]) => `<Relationships ${REL_NS}>${r.join("")}</Relationships>`;

const THEME = `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:themeElements><a:clrScheme name="Office">
    <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
    <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
    <a:dk2><a:srgbClr val="44546A"/></a:dk2>
    <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
  </a:clrScheme></a:themeElements></a:theme>`;

/** A shape tree wrapper. */
const sld = (body: string, tag = "p:sld") =>
  `<${tag} ${NS}><p:cSld><p:spTree>${body}</p:spTree></p:cSld></${tag}>`;

/** A text placeholder shape. */
const phSp = (opts: {
  type?: string;
  idx?: string;
  xfrm?: string;
  text?: string;
  rPr?: string;
  lstStyle?: string;
  pPr?: string;
}) => `<p:sp>
  <p:nvSpPr><p:cNvPr id="2" name="ph"/><p:cNvSpPr/><p:nvPr>
    <p:ph ${opts.type ? `type="${opts.type}"` : ""} ${opts.idx ? `idx="${opts.idx}"` : ""}/>
  </p:nvPr></p:nvSpPr>
  <p:spPr>${opts.xfrm ?? ""}</p:spPr>
  <p:txBody>
    <a:bodyPr/>${opts.lstStyle ?? ""}
    <a:p>${opts.pPr ?? ""}<a:r><a:rPr ${opts.rPr ?? ""}/><a:t>${opts.text ?? "Texte"}</a:t></a:r></a:p>
  </p:txBody>
</p:sp>`;

const xfrm = (x: number, y: number, cx: number, cy: number, rot?: string) =>
  `<a:xfrm ${rot ? `rot="${rot}"` : ""}><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;

/** A slide master. `<p:clrMap>` and `<p:txStyles>` are SIBLINGS of `<p:cSld>`, not
 *  shapes inside the tree — putting them in the tree is the shape a naive fixture
 *  takes, and then the colour chain silently resolves to nothing. */
const master = (opts: { shapes?: string; txStyles?: string; clrMap?: string } = {}) =>
  `<p:sldMaster ${NS}>
     <p:cSld><p:spTree>${opts.shapes ?? ""}</p:spTree></p:cSld>
     <p:clrMap ${opts.clrMap ?? 'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1"'}/>
     ${opts.txStyles ?? ""}
   </p:sldMaster>`;

const MASTER_MIN = master();

/** Build a package. `slides` are raw slide XML strings, in sldIdLst order. */
function build(opts: {
  slides: string[];
  layout?: string;
  master?: string;
  extra?: Record<string, Uint8Array | string>;
  /** Override the presentation → slide order (default: the array order). */
  order?: number[];
}): Uint8Array {
  const { slides, layout = sld("", "p:sldLayout"), master = MASTER_MIN } = opts;
  const order = opts.order ?? slides.map((_, i) => i);
  const files: Record<string, Uint8Array> = {};

  files["ppt/presentation.xml"] = strToU8(
    `<p:presentation ${NS}><p:sldSz cx="12192000" cy="6858000"/><p:sldIdLst>${order
      .map((i, n) => `<p:sldId id="${256 + n}" r:id="rSld${i + 1}"/>`)
      .join("")}</p:sldIdLst></p:presentation>`,
  );
  files["ppt/_rels/presentation.xml.rels"] = strToU8(
    rels(...slides.map((_, i) => rel(`rSld${i + 1}`, `slides/slide${i + 1}.xml`))),
  );
  slides.forEach((xml, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = strToU8(xml);
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = strToU8(
      rels(rel("rL", "../slideLayouts/slideLayout1.xml")),
    );
  });
  files["ppt/slideLayouts/slideLayout1.xml"] = strToU8(layout);
  files["ppt/slideLayouts/_rels/slideLayout1.xml.rels"] = strToU8(
    rels(rel("rM", "../slideMasters/slideMaster1.xml")),
  );
  files["ppt/slideMasters/slideMaster1.xml"] = strToU8(master);
  files["ppt/slideMasters/_rels/slideMaster1.xml.rels"] = strToU8(rels(rel("rT", "../theme/theme1.xml")));
  files["ppt/theme/theme1.xml"] = strToU8(THEME);

  for (const [k, v] of Object.entries(opts.extra ?? {}))
    files[k] = typeof v === "string" ? strToU8(v) : v;
  return zipSync(files);
}

const textShapes = (deck: any, slide = 0): PptxTextShape[] =>
  deck.slides[slide].shapes.filter((s: any) => s.kind === "text");
const firstRun = (deck: any, slide = 0) => textShapes(deck, slide)[0].paras[0].runs[0];

describe("parsePptx — deck geometry", () => {
  it("reads the slide size in px", async () => {
    const deck = await parsePptx(build({ slides: [sld(phSp({ xfrm: xfrm(0, 0, 100, 100) }))] }));
    // 12192000 EMU = 13.333in = 1280px at 96dpi.
    expect(Math.round(deck.widthPx)).toBe(1280);
    expect(Math.round(deck.heightPx)).toBe(720);
  });

  it("orders slides by sldIdLst, NOT by filename", async () => {
    // A reordered deck keeps its original filenames — slide3.xml can be shown first.
    // Sorting by name reads the deck out of order, which no error would ever reveal.
    const mk = (t: string) => sld(phSp({ xfrm: xfrm(0, 0, 100, 100), text: t }));
    const deck = await parsePptx(
      build({ slides: [mk("un"), mk("deux"), mk("trois")], order: [2, 0, 1] }),
    );
    expect(deck.slides.map((_, i) => firstRun(deck, i).text)).toEqual(["trois", "un", "deux"]);
  });

  it("converts a shape's EMU offset/extent to px", async () => {
    const deck = await parsePptx(
      build({ slides: [sld(phSp({ xfrm: xfrm(914400, 457200, 1828800, 914400) }))] }),
    );
    expect(textShapes(deck)[0].frame).toMatchObject({ x: 96, y: 48, w: 192, h: 96 });
  });

  it("reads rotation as 60000ths of a degree", async () => {
    const deck = await parsePptx(
      build({ slides: [sld(phSp({ xfrm: xfrm(0, 0, 100, 100, "2700000") }))] }),
    );
    expect(textShapes(deck)[0].frame.rot).toBe(45);
  });
});

describe("parsePptx — placeholder geometry inheritance", () => {
  it("takes the LAYOUT's position when the slide states none", async () => {
    // The common case by far: a slide's title shape carries only <p:ph type="title"/>.
    // A slide-only parse finds no geometry and has nowhere to put the text.
    const deck = await parsePptx(
      build({
        slides: [sld(phSp({ type: "title", text: "Titre" }))],
        layout: sld(phSp({ type: "title", xfrm: xfrm(914400, 914400, 1828800, 457200) }), "p:sldLayout"),
      }),
    );
    expect(textShapes(deck)[0].frame).toMatchObject({ x: 96, y: 96, w: 192, h: 48 });
  });

  it("falls through to the MASTER when the layout states none either", async () => {
    const deck = await parsePptx(
      build({
        slides: [sld(phSp({ type: "title", text: "Titre" }))],
        layout: sld(phSp({ type: "title" }), "p:sldLayout"),
        master: master({ shapes: phSp({ type: "title", xfrm: xfrm(0, 0, 914400, 457200) }) }),
      }),
    );
    expect(textShapes(deck)[0].frame).toMatchObject({ x: 0, y: 0, w: 96, h: 48 });
  });

  it("lets the slide's OWN xfrm win over the layout's", async () => {
    const deck = await parsePptx(
      build({
        slides: [sld(phSp({ type: "title", xfrm: xfrm(0, 0, 96000, 96000) }))],
        layout: sld(phSp({ type: "title", xfrm: xfrm(914400, 914400, 1828800, 457200) }), "p:sldLayout"),
      }),
    );
    expect(textShapes(deck)[0].frame.x).toBe(0);
  });

  it("matches a placeholder by idx BEFORE type — two body boxes differ only by idx", async () => {
    const deck = await parsePptx(
      build({
        slides: [sld(phSp({ type: "body", idx: "2", text: "deuxième" }))],
        layout: sld(
          phSp({ type: "body", idx: "1", xfrm: xfrm(0, 0, 96000, 96000) }) +
            phSp({ type: "body", idx: "2", xfrm: xfrm(914400, 0, 96000, 96000) }),
          "p:sldLayout",
        ),
      }),
    );
    // Matching on type alone would grab idx=1 (first in the file) and put the text in
    // the wrong column.
    expect(textShapes(deck)[0].frame.x).toBe(96);
  });

  it("treats ctrTitle as a title so it inherits the title placeholder", async () => {
    const deck = await parsePptx(
      build({
        slides: [sld(phSp({ type: "ctrTitle", text: "Titre" }))],
        layout: sld(phSp({ type: "title", xfrm: xfrm(914400, 0, 96000, 96000) }), "p:sldLayout"),
      }),
    );
    expect(textShapes(deck)[0].frame.x).toBe(96);
  });
});

describe("parsePptx — the character-style chain", () => {
  const masterWithTxStyles = (defRPr: string) =>
    master({
      txStyles: `<p:txStyles>
        <p:titleStyle><a:lvl1pPr>${defRPr}</a:lvl1pPr></p:titleStyle>
        <p:bodyStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr>
                     <a:lvl2pPr><a:defRPr sz="1400"/></a:lvl2pPr></p:bodyStyle>
      </p:txStyles>`,
    });

  it("takes the font and size from the MASTER's txStyles when nothing nearer states them", async () => {
    const deck = await parsePptx(
      build({
        slides: [sld(phSp({ type: "title", xfrm: xfrm(0, 0, 100, 100) }))],
        master: masterWithTxStyles(`<a:defRPr sz="4400" b="1"><a:latin typeface="Georgia"/></a:defRPr>`),
      }),
    );
    const r = firstRun(deck);
    expect(r.sizePt).toBe(44); // sz is HUNDREDTHS of a point, not half-points
    expect(r.bold).toBe(true);
    expect(r.font).toBe("Georgia");
  });

  it("picks the txStyles level matching <a:pPr lvl>", async () => {
    const deck = await parsePptx(
      build({
        slides: [sld(phSp({ type: "body", xfrm: xfrm(0, 0, 100, 100), pPr: `<a:pPr lvl="1"/>` }))],
        master: masterWithTxStyles(`<a:defRPr sz="4400"/>`),
      }),
    );
    expect(firstRun(deck).sizePt).toBe(14); // lvl2pPr, not lvl1pPr
  });

  it("lets the LAYOUT's list style beat the MASTER's", async () => {
    const deck = await parsePptx(
      build({
        slides: [sld(phSp({ type: "title", xfrm: xfrm(0, 0, 100, 100) }))],
        layout: sld(
          phSp({ type: "title", lstStyle: `<a:lstStyle><a:lvl1pPr><a:defRPr sz="3200"/></a:lvl1pPr></a:lstStyle>` }),
          "p:sldLayout",
        ),
        master: masterWithTxStyles(`<a:defRPr sz="4400"/>`),
      }),
    );
    // The merge applies master → layout; getting the order backwards silently reverts
    // every layout that customises the master.
    expect(firstRun(deck).sizePt).toBe(32);
  });

  it("lets the RUN's own rPr beat everything", async () => {
    const deck = await parsePptx(
      build({
        slides: [sld(phSp({ type: "title", xfrm: xfrm(0, 0, 100, 100), rPr: 'sz="1200" b="0"' }))],
        master: masterWithTxStyles(`<a:defRPr sz="4400" b="1"/>`),
      }),
    );
    const r = firstRun(deck);
    expect(r.sizePt).toBe(12);
    expect(r.bold).toBe(false); // an explicit off against the master's bold
  });

  it("resolves a run colour through clrMap → theme", async () => {
    const body = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="x"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr>${xfrm(0, 0, 100, 100)}</p:spPr>
      <p:txBody><a:bodyPr/><a:p><a:r>
        <a:rPr><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:rPr>
        <a:t>Rebour</a:t>
      </a:r></a:p></p:txBody></p:sp>`;
    const deck = await parsePptx(build({ slides: [sld(body)] }));
    // tx1 → (master clrMap) dk1 → (theme) #000000. Three files to answer "what colour
    // is this word"; the slide alone says only "tx1".
    expect(firstRun(deck).color).toBe("#000000");
  });

  it("falls back to no colour — not to black — when the clrMap has no such slot", async () => {
    const body = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="x"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr>${xfrm(0, 0, 100, 100)}</p:spPr>
      <p:txBody><a:bodyPr/><a:p><a:r>
        <a:rPr><a:solidFill><a:schemeClr val="nope"/></a:solidFill></a:rPr>
        <a:t>x</a:t>
      </a:r></a:p></p:txBody></p:sp>`;
    const deck = await parsePptx(build({ slides: [sld(body)] }));
    // undefined = "inherit", which the render turns into the page's floor. Guessing
    // black here would be indistinguishable from a real black in the file.
    expect(firstRun(deck).color).toBeUndefined();
  });
});

describe("parsePptx — bullets inherit too", () => {
  // Paragraph-level properties ride the SAME chain as character ones. PowerPoint puts
  // the bullet on the MASTER's bodyStyle, essentially never on the paragraph — so a
  // parser that reads only <a:pPr> drops every bullet in a real deck while passing a
  // test whose fixture helpfully states one.
  const bulletMaster = master({
    txStyles: `<p:txStyles>
      <p:titleStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="4000"/></a:lvl1pPr></p:titleStyle>
      <p:bodyStyle>
        <a:lvl1pPr><a:buChar char="•"/><a:defRPr sz="2000"/></a:lvl1pPr>
        <a:lvl2pPr><a:buChar char="–"/><a:defRPr sz="1600"/></a:lvl2pPr>
      </p:bodyStyle></p:txStyles>`,
  });

  it("inherits the bullet from the MASTER's bodyStyle", async () => {
    const deck = await parsePptx(
      build({
        slides: [sld(phSp({ type: "body", xfrm: xfrm(0, 0, 100, 100), text: "Rebour" }))],
        master: bulletMaster,
      }),
    );
    expect(textShapes(deck)[0].paras[0].bullet).toBe("•");
  });

  it("takes the bullet for the paragraph's own LEVEL", async () => {
    const deck = await parsePptx(
      build({
        slides: [
          sld(phSp({ type: "body", xfrm: xfrm(0, 0, 100, 100), pPr: `<a:pPr lvl="1"/>` })),
        ],
        master: bulletMaster,
      }),
    );
    expect(textShapes(deck)[0].paras[0].bullet).toBe("–");
  });

  it("lets a paragraph's buNone turn OFF the master's bullet", async () => {
    // buNone is a STATEMENT, not silence: collapsing it with "states nothing" would
    // re-bullet every line a deck deliberately un-bulleted.
    const deck = await parsePptx(
      build({
        slides: [
          sld(phSp({ type: "body", xfrm: xfrm(0, 0, 100, 100), pPr: `<a:pPr><a:buNone/></a:pPr>` })),
        ],
        master: bulletMaster,
      }),
    );
    expect(textShapes(deck)[0].paras[0].bullet).toBeUndefined();
  });

  it("inherits alignment from the master's txStyles", async () => {
    const deck = await parsePptx(
      build({
        slides: [sld(phSp({ type: "title", xfrm: xfrm(0, 0, 100, 100) }))],
        master: bulletMaster,
      }),
    );
    expect(textShapes(deck)[0].paras[0].align).toBe("center");
  });
});

describe("parsePptx — text integrity", () => {
  it("keeps the bullet OUT of the run text", async () => {
    // A bullet is presentation. In a run it would join a selection over the slide and
    // corrupt the value a redaction matches on.
    const deck = await parsePptx(
      build({
        slides: [
          sld(phSp({ type: "body", xfrm: xfrm(0, 0, 100, 100), text: "Rebour", pPr: `<a:pPr><a:buChar char="•"/></a:pPr>` })),
        ],
      }),
    );
    const para = textShapes(deck)[0].paras[0];
    expect(para.bullet).toBe("•");
    expect(para.runs.map((r) => r.text).join("")).toBe("Rebour");
  });

  it("honours buNone", async () => {
    const deck = await parsePptx(
      build({
        slides: [sld(phSp({ type: "body", xfrm: xfrm(0, 0, 100, 100), pPr: `<a:pPr><a:buNone/></a:pPr>` }))],
      }),
    );
    expect(textShapes(deck)[0].paras[0].bullet).toBeUndefined();
  });

  it("coalesces adjacent same-styled runs so a split value stays ONE string", async () => {
    const body = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="x"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr>${xfrm(0, 0, 100, 100)}</p:spPr>
      <p:txBody><a:bodyPr/><a:p>
        <a:r><a:rPr sz="1800"/><a:t>Jean</a:t></a:r>
        <a:r><a:rPr sz="1800"/><a:t>-Rebour</a:t></a:r>
      </a:p></p:txBody></p:sp>`;
    const deck = await parsePptx(build({ slides: [sld(body)] }));
    const runs = textShapes(deck)[0].paras[0].runs;
    expect(runs.map((r) => r.text).join("")).toBe("Jean-Rebour");
    expect(runs).toHaveLength(1);
  });

  it("does NOT merge runs that differ in formatting", async () => {
    const body = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="x"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr>${xfrm(0, 0, 100, 100)}</p:spPr>
      <p:txBody><a:bodyPr/><a:p>
        <a:r><a:rPr b="1"/><a:t>gras</a:t></a:r>
        <a:r><a:rPr b="0"/><a:t>normal</a:t></a:r>
      </a:p></p:txBody></p:sp>`;
    const deck = await parsePptx(build({ slides: [sld(body)] }));
    expect(textShapes(deck)[0].paras[0].runs).toHaveLength(2);
  });
});

describe("parsePptx — pictures", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const pic = `<p:pic>
    <p:nvPicPr><p:cNvPr id="3" name="Image" descr="un logo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
    <p:blipFill><a:blip r:embed="rImg"/></p:blipFill>
    <p:spPr>${xfrm(914400, 0, 914400, 457200)}</p:spPr>
  </p:pic>`;

  it("inlines an embedded raster and positions it", async () => {
    const deck = await parsePptx(
      build({
        slides: [sld(pic)],
        extra: {
          "ppt/slides/_rels/slide1.xml.rels": rels(
            rel("rL", "../slideLayouts/slideLayout1.xml"),
            rel("rImg", "../media/logo.png"),
          ),
          "ppt/media/logo.png": PNG,
        },
      }),
    );
    const img = deck.slides[0].shapes[0] as PptxImageShape;
    expect(img.kind).toBe("image");
    expect(img.src.startsWith("data:image/png;base64,")).toBe(true);
    expect(img.frame).toMatchObject({ x: 96, y: 0, w: 96, h: 48 });
    expect(img.alt).toBe("un logo");
  });

  it("DROPS an External picture — no outbound request from opening a deck", async () => {
    const deck = await parsePptx(
      build({
        slides: [sld(pic)],
        extra: {
          "ppt/slides/_rels/slide1.xml.rels": rels(
            rel("rL", "../slideLayouts/slideLayout1.xml"),
            rel("rImg", "https://tracker.example/p.png", 'TargetMode="External"'),
          ),
        },
      }),
    );
    expect(deck.slides[0].shapes).toHaveLength(0);
  });

  it("keeps document order as z-order", async () => {
    const deck = await parsePptx(
      build({
        slides: [sld(pic + phSp({ xfrm: xfrm(0, 0, 100, 100), text: "devant" }))],
        extra: {
          "ppt/slides/_rels/slide1.xml.rels": rels(
            rel("rL", "../slideLayouts/slideLayout1.xml"),
            rel("rImg", "../media/logo.png"),
          ),
          "ppt/media/logo.png": PNG,
        },
      }),
    );
    // The picture is authored first = painted under. Sorting shapes would put the text
    // behind the image.
    expect(deck.slides[0].shapes.map((s) => s.kind)).toEqual(["image", "text"]);
  });
});

describe("parsePptx — failure is loud", () => {
  it("throws on a zip that is not a .pptx rather than returning an empty deck", async () => {
    await expect(parsePptx(zipSync({ "hello.txt": strToU8("nope") }))).rejects.toThrow();
  });
});
