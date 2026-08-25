import { A, P, R, attr, attrNS, child, children, num, path } from "../ooxml/xml";
import { emuToPx, hundredthsToPt } from "../ooxml/units";
import { resolveColorEl, solidFill, type ClrMap, type ClrScheme } from "../ooxml/color";
import { mergeStyle, type RunStyle } from "../ooxml/textStyle";
import { imageDataUri } from "../ooxml/media";
import { openOoxml, type OoxmlPackage } from "../ooxml/zip";
import {
  bodyPrOf,
  buildSlideContext,
  lstStyleLvlPPr,
  placeholderOf,
  shapeTree,
  txBodyOf,
  xfrmOf,
  type SlideContext,
} from "./pptxInherit";
import type { PptxDeck, PptxFrame, PptxPara, PptxRun, PptxShape, PptxSlide } from "./pptxModel";

// `.pptx` → the typed model in `pptxModel.ts`. The inheritance walk lives in
// `pptxInherit.ts`; this file reads the properties and assembles them.

/** Default slide size when `<p:sldSz>` is missing: 16:9 at 96dpi. */
const DEFAULT_W = 12192000; // EMU
const DEFAULT_H = 6858000;

/** Read an `<a:rPr>`/`<a:defRPr>` into a RunStyle. Only what it states. */
function readRunProps(rPr: Element | null, scheme: ClrScheme, map: ClrMap): RunStyle {
  if (!rPr) return {};
  const sz = num(attr(rPr, "sz"));
  const u = attr(rPr, "u");
  const latin = child(rPr, A, "latin");
  const b = attr(rPr, "b");
  const i = attr(rPr, "i");
  const strike = attr(rPr, "strike");
  const caps = attr(rPr, "cap");
  const onOffAttr = (v: string | undefined): boolean | undefined =>
    v === undefined ? undefined : v === "1" || v === "true";
  return {
    bold: onOffAttr(b),
    italic: onOffAttr(i),
    // `u="none"` is an explicit OFF against an inherited underline, distinct from absent.
    underline: u === undefined ? undefined : u !== "none",
    strike: strike === undefined ? undefined : strike !== "noStrike",
    // pptx sz is HUNDREDTHS of a point (2400 = 24pt) — NOT half-points like docx's
    // <w:sz>. The twin spelling is the trap `../ooxml/units.ts` exists for.
    sizePt: sz === undefined ? undefined : hundredthsToPt(sz),
    font: attr(latin, "typeface") ?? undefined,
    color: solidFill(rPr, scheme, map),
    caps: caps === undefined ? undefined : caps === "all",
    smallCaps: caps === undefined ? undefined : caps === "small",
  };
}

/** The bullet stated by ONE `<a:pPr>`/`<a:lvlNpPr>`: a glyph, `"#"` for auto-numbering,
 *  `null` for an explicit `<a:buNone/>`, or undefined when it states nothing (inherit).
 *  `null` and undefined must stay distinct — `buNone` is how a paragraph turns OFF a
 *  bullet its master declares, so collapsing them re-bullets every un-bulleted line. */
function bulletHere(pPr: Element | null): string | null | undefined {
  if (!pPr) return undefined;
  if (child(pPr, A, "buNone")) return null;
  const buChar = child(pPr, A, "buChar");
  if (buChar) return attr(buChar, "char") ?? "•";
  if (child(pPr, A, "buAutoNum")) return "#";
  return undefined;
}

function alignHere(pPr: Element | null): PptxPara["align"] {
  const a = attr(pPr, "algn");
  return a === "ctr" ? "center" : a === "r" ? "right" : a === "just" ? "justify" : a === "l" ? "left" : undefined;
}

/**
 * One `<a:p>` → a paragraph. `lvlChain(level)` is the ordered `<a:lvlNpPr>` chain for
 * this shape at this level, WEAKEST FIRST (master txStyles → master ph → layout ph →
 * shape lstStyle); the paragraph's own `<a:pPr>` is the strongest link and is appended
 * here. Character formatting comes off each link's `<a:defRPr>`, paragraph formatting
 * (bullet, alignment) off the link itself.
 */
function readPara(
  p: Element,
  ctx: SlideContext,
  lvlChain: (level: number) => (Element | null)[],
): PptxPara {
  const pPr = child(p, A, "pPr");
  const level = num(attr(pPr, "lvl")) ?? 0;
  const chain = [...lvlChain(level), pPr];

  let base: RunStyle = {};
  for (const link of chain) base = mergeStyle(base, readRunProps(child(link, A, "defRPr"), ctx.scheme, ctx.map));
  // A run's own <a:rPr> is applied per-run below; <a:pPr><a:defRPr> is the paragraph's.

  // Nearest link that STATES a bullet wins; `null` (buNone) is a statement, so the walk
  // stops there rather than falling through to the master's glyph.
  let bullet: string | undefined;
  for (const link of chain) {
    const b = bulletHere(link);
    if (b !== undefined) bullet = b ?? undefined;
  }
  let align: PptxPara["align"];
  for (const link of chain) align = alignHere(link) ?? align;

  const runs: PptxRun[] = [];
  for (const node of p.children) {
    if (node.namespaceURI !== A) continue;
    if (node.localName === "r") {
      const style = mergeStyle(base, readRunProps(child(node, A, "rPr"), ctx.scheme, ctx.map));
      const text = child(node, A, "t")?.textContent ?? "";
      if (!text) continue;
      const last = runs[runs.length - 1];
      // Coalesce adjacent runs that carry the SAME formatting: PowerPoint splits a run
      // on its own bookkeeping, and a redaction matches by value, so a name split
      // across two <a:r> must present as one string.
      if (last && JSON.stringify({ ...last, text: "" }) === JSON.stringify({ ...style, text: "" }))
        last.text += text;
      else runs.push({ ...style, text });
    } else if (node.localName === "br") {
      const last = runs[runs.length - 1];
      if (last) last.text += "\n";
    } else if (node.localName === "fld") {
      // A field (slide number, date) has a cached <a:t> — render the cache; we cannot
      // recompute it, and dropping it would leave a visible hole in the slide.
      const text = child(node, A, "t")?.textContent ?? "";
      if (text) runs.push({ ...base, text });
    }
  }
  return { runs, level, align, bullet };
}

/** EMU frame → px frame. */
const toFrame = (x: number, y: number, w: number, h: number, rot?: number): PptxFrame => ({
  x: emuToPx(x),
  y: emuToPx(y),
  w: emuToPx(w),
  h: emuToPx(h),
  rot,
});

/** A shape's geometry: its own `<a:xfrm>`, else the layout's placeholder, else the
 *  master's. A placeholder normally states NONE — inheriting it is the whole job. */
function resolveFrame(sp: Element, inherited: Element[]): PptxFrame | undefined {
  for (const el of [sp, ...inherited]) {
    const x = xfrmOf(el);
    if (x) return toFrame(x.x, x.y, x.w, x.h, x.rot);
  }
  return undefined;
}

const PAD_DEFAULT = { l: 91440, t: 45720, r: 91440, b: 45720 }; // EMU, the OOXML defaults

function readBodyPad(sp: Element): PptxTextPad {
  const bodyPr = bodyPrOf(sp);
  const px = (name: keyof typeof PAD_DEFAULT, attrName: string) =>
    emuToPx(num(attr(bodyPr, attrName)) ?? PAD_DEFAULT[name]);
  return { l: px("l", "lIns"), t: px("t", "tIns"), r: px("r", "rIns"), b: px("b", "bIns") };
}
type PptxTextPad = { l: number; t: number; r: number; b: number };

function readAnchor(sp: Element, inherited: Element[]): "top" | "center" | "bottom" | undefined {
  for (const el of [sp, ...inherited]) {
    const a = attr(bodyPrOf(el), "anchor");
    if (a) return a === "ctr" ? "center" : a === "b" ? "bottom" : "top";
  }
  return undefined;
}

function readTextShape(sp: Element, ctx: SlideContext): PptxShape | undefined {
  const key = placeholderOf(sp);
  const inherited = key ? ctx.inheritedShapes(key) : [];
  const frame = resolveFrame(sp, inherited);
  const txBody = txBodyOf(sp);
  if (!frame || !txBody) return undefined;

  // The inherited chain for this shape at a given level, WEAKEST FIRST. Each link
  // states only what it overrides; skip one and the text renders in the app's default
  // rather than the deck's.
  const lvlChain = (level: number): (Element | null)[] => [
    key ? ctx.txStyleLvlPPr(key, level) : null,
    // `inherited` is layout-then-master (nearest first), so REVERSE it — master is the
    // weaker layer and must not overwrite the layout.
    ...[...inherited].reverse().map((el) => lstStyleLvlPPr(el, level)),
    lstStyleLvlPPr(sp, level),
  ];

  const paras = children(txBody, A, "p").map((p) => readPara(p, ctx, lvlChain));
  if (!paras.some((p) => p.runs.length)) return undefined; // an empty placeholder box

  return {
    kind: "text",
    frame,
    paras,
    anchor: readAnchor(sp, inherited),
    fill: solidFill(child(sp, P, "spPr"), ctx.scheme, ctx.map),
    pad: readBodyPad(sp),
  };
}

function readPicture(pic: Element, ctx: SlideContext, pkg: OoxmlPackage, part: string): PptxShape | undefined {
  const blip = pic.getElementsByTagNameNS(A, "blip")[0];
  const embed = attrNS(blip, R, "embed");
  if (!embed) return undefined;
  const target = pkg.rels(part).get(embed);
  const src = target ? imageDataUri(pkg.bytes(target)) : undefined;
  if (!src) return undefined; // external, missing, or not an allow-listed raster
  const x = xfrmOf(pic);
  if (!x) return undefined;
  const cNvPr = pic.getElementsByTagNameNS(P, "cNvPr")[0];
  return {
    kind: "image",
    frame: toFrame(x.x, x.y, x.w, x.h, x.rot),
    src,
    alt: attr(cNvPr, "descr") || undefined,
  };
}

/** Walk a shape tree in DOCUMENT ORDER — that is the deck's z-order, so the render
 *  must not reorder it. Groups are flattened; their children keep slide coordinates
 *  when the group applies no child offset (the common case). */
function readTree(tree: Element | null, ctx: SlideContext, pkg: OoxmlPackage, part: string): PptxShape[] {
  if (!tree) return [];
  const out: PptxShape[] = [];
  for (const node of tree.children) {
    if (node.namespaceURI !== P) continue;
    if (node.localName === "sp") {
      const s = readTextShape(node, ctx);
      if (s) out.push(s);
    } else if (node.localName === "pic") {
      const s = readPicture(node, ctx, pkg, part);
      if (s) out.push(s);
    } else if (node.localName === "grpSp") {
      out.push(...readTree(node, ctx, pkg, part));
    }
  }
  return out;
}

/** The slide parts, in the deck's OWN order. `<p:sldIdLst>` is the authority: the
 *  filename number is an id, not a position, so a reordered deck (slide3 shown first)
 *  reads out of order if you sort by name. Falls back to the numeric sort when
 *  presentation.xml cannot be followed. */
function slideParts(pkg: OoxmlPackage): string[] {
  const pres = pkg.xml("ppt/presentation.xml");
  const lst = child(pres?.documentElement, P, "sldIdLst");
  const rels = pkg.rels("ppt/presentation.xml");
  const ordered: string[] = [];
  for (const sldId of children(lst, P, "sldId")) {
    const rid = attrNS(sldId, R, "id");
    const target = rid ? rels.get(rid) : undefined;
    if (target && pkg.bytes(target)) ordered.push(target);
  }
  return ordered.length ? ordered : pkg.parts(/^ppt\/slides\/slide\d+\.xml$/);
}

function readBackground(bg: Element | null, scheme: ClrScheme, map: ClrMap): string | undefined {
  if (!bg) return undefined;
  const direct = solidFill(child(bg, P, "bgPr"), scheme, map);
  if (direct) return direct;
  // <p:bgRef> points into the theme's fill styles; resolving the whole style matrix is
  // out of scope, but its <a:schemeClr> child alone gives the flat colour, which is
  // what the overwhelming majority of decks actually use.
  const bgRef = child(bg, P, "bgRef");
  const first = bgRef ? [...bgRef.children].find((c) => c.namespaceURI === A) : undefined;
  return resolveColorEl(first, scheme, map);
}

/** Parse a .pptx into the render model. Throws on a file that is not a readable
 *  PresentationML package, so the caller can say "illisible" rather than render an
 *  empty deck — a blank render would claim the file has no slides. */
export async function parsePptx(bytes: Uint8Array): Promise<PptxDeck> {
  const pkg = await openOoxml(bytes);
  const parts = slideParts(pkg);
  if (!parts.length) throw new Error("not a .pptx (no slides)");

  const pres = pkg.xml("ppt/presentation.xml");
  const sldSz = child(pres?.documentElement, P, "sldSz");
  const widthPx = emuToPx(num(attr(sldSz, "cx")) ?? DEFAULT_W);
  const heightPx = emuToPx(num(attr(sldSz, "cy")) ?? DEFAULT_H);

  const slides: PptxSlide[] = [];
  for (const part of parts) {
    const doc = pkg.xml(part);
    if (!doc) continue;
    const ctx = buildSlideContext(pkg, part);
    slides.push({
      shapes: readTree(shapeTree(doc), ctx, pkg, part),
      background: readBackground(ctx.background(doc), ctx.scheme, ctx.map),
    });
  }
  return { slides, widthPx, heightPx };
}
