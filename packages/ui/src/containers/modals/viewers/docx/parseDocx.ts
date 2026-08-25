import { A, R, W, attr, attrNS, child, children, num } from "../ooxml/xml";
import { emuToPx, twipsToPx } from "../ooxml/units";
import { parseClrScheme, type ClrScheme } from "../ooxml/color";
import { imageDataUri } from "../ooxml/media";
import { openOoxml, type OoxmlPackage } from "../ooxml/zip";
import { buildStyles, mergeRun, readParaProps, readRunProps, type DocxStyles } from "./docxStyles";
import type { DocxBlock, DocxCell, DocxDoc, DocxInline, DocxPara, DocxTable } from "./docxModel";

// `word/document.xml` → the typed model in `docxModel.ts`. Pure apart from the zip
// read; every unit conversion goes through `../ooxml/units`. Tested against
// hand-authored OOXML (`parseDocx.test.ts`) plus the repo's two real fixtures.

const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";

/** The docx page body width (page minus margins), so the preview wraps where the
 *  document wraps instead of at the panel edge. */
function bodyWidth(sectPr: Element | null): number | undefined {
  const w = num(attrNS(child(sectPr, W, "pgSz"), W, "w"));
  if (w === undefined) return undefined;
  const mar = child(sectPr, W, "pgMar");
  const left = num(attrNS(mar, W, "left")) ?? 0;
  const right = num(attrNS(mar, W, "right")) ?? 0;
  return twipsToPx(Math.max(1, w - left - right));
}

/** An inline image from a `<w:drawing>`. Returns undefined (→ the drawing is dropped)
 *  when the relationship is external, the part is missing, or the bytes are not an
 *  allow-listed raster — a chart or an embedded object has no raster to show. */
function readDrawing(drawing: Element, pkg: OoxmlPackage, partPath: string): DocxInline | undefined {
  const blip = drawing.getElementsByTagNameNS(A, "blip")[0];
  const embed = attrNS(blip, R, "embed");
  if (!embed) return undefined;
  const target = pkg.rels(partPath).get(embed);
  const src = target ? imageDataUri(pkg.bytes(target)) : undefined;
  if (!src) return undefined;
  const extent = drawing.getElementsByTagNameNS(DRAWING_NS, "extent")[0];
  const cx = num(attr(extent, "cx"));
  const cy = num(attr(extent, "cy"));
  const docPr = drawing.getElementsByTagNameNS(DRAWING_NS, "docPr")[0];
  return {
    kind: "image",
    src,
    widthPx: cx === undefined ? undefined : emuToPx(cx),
    heightPx: cy === undefined ? undefined : emuToPx(cy),
    alt: attr(docPr, "descr") || undefined,
  };
}

/** One `<w:r>` → its inlines, in document order. A run is not just text: it can carry
 *  tabs, breaks and drawings between its text nodes, and flattening it to `textContent`
 *  would glue words across a break. */
function readRun(
  r: Element,
  base: ReturnType<DocxStyles["runStyleFor"]>,
  styles: DocxStyles,
  scheme: ClrScheme,
  pkg: OoxmlPackage,
  partPath: string,
): DocxInline[] {
  const rPr = child(r, W, "rPr");
  // A run may name its OWN character style (<w:rStyle>), which sits between the
  // paragraph's style and the run's direct formatting.
  const rStyle = attrNS(child(rPr, W, "rStyle"), W, "val");
  const style = mergeRun(mergeRun(base, rStyle ? styles.runStyleFor(rStyle) : {}), readRunProps(rPr, scheme));

  const out: DocxInline[] = [];
  const push = (text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    // Coalesce adjacent text so a value split across <w:t> nodes stays ONE string.
    // Word routinely splits a word mid-value (spell-check state, rsid marks), and a
    // redaction match is by value — "Jean" + "-Rebour" in two nodes must present as
    // one run or the mark cannot span them.
    if (last?.kind === "run") last.text += text;
    else out.push({ ...style, kind: "run", text });
  };

  for (const node of r.children) {
    if (node.namespaceURI !== W && node.namespaceURI !== DRAWING_NS) continue;
    switch (node.localName) {
      case "t":
        push(node.textContent ?? "");
        break;
      case "tab":
        push("\t");
        break;
      case "br":
      case "cr":
        push("\n");
        break;
      case "noBreakHyphen":
        push("‑");
        break;
      case "softHyphen":
        break; // a hint, not a character
      case "drawing": {
        const img = readDrawing(node, pkg, partPath);
        if (img) out.push(img);
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** Runs of a paragraph-level container, following `<w:hyperlink>` and `<w:smartTag>`
 *  wrappers. Their runs are ordinary runs — skipping the wrapper drops the text. */
function paraRuns(
  container: Element,
  base: ReturnType<DocxStyles["runStyleFor"]>,
  styles: DocxStyles,
  scheme: ClrScheme,
  pkg: OoxmlPackage,
  partPath: string,
): DocxInline[] {
  const out: DocxInline[] = [];
  for (const node of container.children) {
    if (node.namespaceURI !== W) continue;
    if (node.localName === "r") out.push(...readRun(node, base, styles, scheme, pkg, partPath));
    else if (node.localName === "hyperlink" || node.localName === "smartTag" || node.localName === "ins")
      out.push(...paraRuns(node, base, styles, scheme, pkg, partPath));
    // <w:del> is deleted tracked-change text: it is NOT in the document, so it must
    // not render — and must not be selectable for redaction either.
  }
  return out;
}

function readPara(
  p: Element,
  styles: DocxStyles,
  scheme: ClrScheme,
  pkg: OoxmlPackage,
  partPath: string,
): DocxPara {
  const pPr = child(p, W, "pPr");
  const styleId = attrNS(child(pPr, W, "pStyle"), W, "val");
  const fromStyle = styles.paraStyleFor(styleId);
  const direct = readParaProps(pPr, scheme);
  const para = { ...fromStyle, ...Object.fromEntries(Object.entries(direct).filter(([, v]) => v !== undefined)) };

  // The paragraph's run baseline: docDefaults → the paragraph style's rPr → the
  // paragraph mark's own rPr (<w:pPr><w:rPr>), which Word uses for "every run here".
  const base = mergeRun(styles.runStyleFor(styleId), readRunProps(child(pPr, W, "rPr"), scheme));

  const ilvl = para.ilvl ?? 0;
  return {
    kind: "para",
    inlines: paraRuns(p, base, styles, scheme, pkg, partPath),
    align: para.align,
    headingLevel: para.headingLevel,
    indentPx: para.indentPx,
    spaceBeforePt: para.spaceBeforePt,
    spaceAfterPt: para.spaceAfterPt,
    background: para.background,
    list: para.numId !== undefined ? { level: ilvl, ordered: styles.isOrdered(para.numId, ilvl) } : undefined,
  };
}

function readTable(
  tbl: Element,
  styles: DocxStyles,
  scheme: ClrScheme,
  pkg: OoxmlPackage,
  partPath: string,
): DocxTable {
  const rows: DocxCell[][] = [];
  for (const tr of children(tbl, W, "tr")) {
    const cells: DocxCell[] = [];
    for (const tc of children(tr, W, "tc")) {
      const tcPr = child(tc, W, "tcPr");
      const fill = attrNS(child(tcPr, W, "shd"), W, "fill");
      cells.push({
        blocks: readBlocks(tc, styles, scheme, pkg, partPath),
        colSpan: num(attrNS(child(tcPr, W, "gridSpan"), W, "val")),
        background: fill && fill !== "auto" && /^[0-9a-f]{6}$/i.test(fill) ? `#${fill.toLowerCase()}` : undefined,
      });
    }
    if (cells.length) rows.push(cells);
  }
  return { kind: "table", rows };
}

/** Block children of a body or a table cell. Recursive: a cell holds paragraphs AND
 *  nested tables. */
function readBlocks(
  container: Element,
  styles: DocxStyles,
  scheme: ClrScheme,
  pkg: OoxmlPackage,
  partPath: string,
): DocxBlock[] {
  const out: DocxBlock[] = [];
  for (const node of container.children) {
    if (node.namespaceURI !== W) continue;
    if (node.localName === "p") out.push(readPara(node, styles, scheme, pkg, partPath));
    else if (node.localName === "tbl") out.push(readTable(node, styles, scheme, pkg, partPath));
  }
  return out;
}

/** Parse a .docx into the render model. Throws on a file that is not a readable
 *  WordprocessingML package — the caller shows "document illisible" rather than an
 *  empty page, so a parse failure is never mistaken for an empty document. */
export async function parseDocx(bytes: Uint8Array): Promise<DocxDoc> {
  const pkg = await openOoxml(bytes);
  const PART = "word/document.xml";
  const doc = pkg.xml(PART);
  if (!doc) throw new Error("not a .docx (no word/document.xml)");

  const scheme = parseClrScheme(pkg.xml("word/theme/theme1.xml"));
  const styles = buildStyles(pkg.xml("word/styles.xml"), pkg.xml("word/numbering.xml"), scheme);

  const body = child(doc.documentElement, W, "body");
  if (!body) throw new Error("not a .docx (no body)");

  return {
    blocks: readBlocks(body, styles, scheme, pkg, PART),
    bodyWidthPx: bodyWidth(child(body, W, "sectPr")),
    defaultStyle: styles.defaultRun,
  };
}
