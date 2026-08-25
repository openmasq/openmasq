import { A, P, attr, child, children, num, path } from "../ooxml/xml";
import { parseClrMap, parseClrScheme, type ClrMap, type ClrScheme } from "../ooxml/color";
import type { OoxmlPackage } from "../ooxml/zip";

// The pptx inheritance chain — the part a slide-only parse cannot see.
//
//   slide → slideLayout → slideMaster → theme
//
// Most text on a slide carries NEITHER geometry NOR font. The shape says only
// `<p:ph type="title" idx="1"/>`; the position lives on the layout's matching
// placeholder, the font on the master's txStyles, the colour in the theme via the
// master's clrMap. Read only `slide1.xml` and you get strings with nowhere to put them
// — which is exactly what a "readable extraction" parser settles for.
//
// Character formatting is assembled weakest-first:
//
//   master txStyles[type][lvl] → master ph lstStyle → layout ph lstStyle
//     → shape lstStyle → paragraph defRPr → run rPr
//
// Every layer states only what it overrides.

/** A placeholder's identity. `idx` wins over `type` when both sides have one — two
 *  body placeholders on the same layout are told apart ONLY by idx. */
interface PhKey {
  type?: string;
  idx?: string;
}

export interface SlideContext {
  scheme: ClrScheme;
  map: ClrMap;
  /** The layout/master placeholder matching `ph`, nearest first. Empty when the shape
   *  is not a placeholder. */
  inheritedShapes(ph: PhKey): Element[];
  /** The master's `<p:txStyles>` `<a:lvlNpPr>` for this placeholder type + level. */
  txStyleLvlPPr(ph: PhKey, level: number): Element | null;
  /** Slide background, resolved slide → layout → master. */
  background(slide: Document): Element | null;
}

const ph = (sp: Element): PhKey | undefined => {
  const el = path(sp, P, "nvSpPr", "nvPr", "ph") ?? path(sp, P, "nvPicPr", "nvPr", "ph");
  return el ? { type: attr(el, "type") ?? undefined, idx: attr(el, "idx") ?? undefined } : undefined;
};

/** `ctrTitle` is a title; `subTitle`/`obj` behave as body. Normalising here means the
 *  layout lookup and the txStyles lookup agree — otherwise a centred title inherits
 *  the body font. A placeholder with NO type defaults to `body` per the spec. */
function normalizeType(t: string | undefined): string {
  if (!t) return "body";
  if (t === "ctrTitle") return "title";
  if (t === "subTitle" || t === "obj") return "body";
  return t;
}

const shapeTree = (doc: Document | undefined): Element | null =>
  path(doc?.documentElement, P, "cSld", "spTree");

/** Every `<p:sp>` in a tree, including inside group shapes. */
function allShapes(tree: Element | null): Element[] {
  if (!tree) return [];
  const out: Element[] = [];
  for (const node of tree.children) {
    if (node.namespaceURI !== P) continue;
    if (node.localName === "sp") out.push(node);
    else if (node.localName === "grpSp") out.push(...allShapes(node));
  }
  return out;
}

/** Find the placeholder shape in `tree` that `key` inherits from. */
function matchPlaceholder(tree: Element | null, key: PhKey): Element | null {
  const shapes = allShapes(tree);
  // idx is the precise identity: two "body" placeholders differ only by it, so an
  // idx match must beat a type match rather than whichever comes first in the file.
  if (key.idx !== undefined) {
    const byIdx = shapes.find((sp) => ph(sp)?.idx === key.idx);
    if (byIdx) return byIdx;
  }
  const want = normalizeType(key.type);
  return shapes.find((sp) => normalizeType(ph(sp)?.type) === want) ?? null;
}

/** Follow a part's rels to the single related part whose path matches `re`. */
function relatedPart(pkg: OoxmlPackage, part: string, re: RegExp): string | undefined {
  for (const target of pkg.rels(part).values()) if (re.test(target)) return target;
  return undefined;
}

export function buildSlideContext(pkg: OoxmlPackage, slidePart: string): SlideContext {
  const layoutPart = relatedPart(pkg, slidePart, /slideLayouts\/slideLayout\d+\.xml$/);
  const masterPart = layoutPart
    ? relatedPart(pkg, layoutPart, /slideMasters\/slideMaster\d+\.xml$/)
    : undefined;
  const themePart = masterPart ? relatedPart(pkg, masterPart, /theme\/theme\d+\.xml$/) : undefined;

  const layout = layoutPart ? pkg.xml(layoutPart) : undefined;
  const master = masterPart ? pkg.xml(masterPart) : undefined;
  const scheme = parseClrScheme(themePart ? pkg.xml(themePart) : undefined);
  // The clrMap lives on the MASTER; a layout may override it with <p:clrMapOvr>, which
  // is usually "inherit". Without the map, a slide's `tx1` matches no theme slot and
  // every run silently falls back to the default ink.
  const map = parseClrMap(child(master?.documentElement, P, "clrMap"));

  const layoutTree = shapeTree(layout);
  const masterTree = shapeTree(master);

  return {
    scheme,
    map,
    inheritedShapes(key) {
      const out: Element[] = [];
      const l = matchPlaceholder(layoutTree, key);
      if (l) out.push(l);
      const m = matchPlaceholder(masterTree, key);
      if (m) out.push(m);
      return out;
    },
    txStyleLvlPPr(key, level) {
      const txStyles = child(master?.documentElement, P, "txStyles");
      if (!txStyles) return null;
      const t = normalizeType(key.type);
      const styleEl =
        t === "title" ? child(txStyles, P, "titleStyle")
        : t === "body" ? child(txStyles, P, "bodyStyle")
        : child(txStyles, P, "otherStyle");
      // Levels are 1-based in the element name and 0-based on <a:pPr lvl>.
      return child(styleEl, A, `lvl${Math.min(9, level + 1)}pPr`);
    },
    background(slide) {
      for (const doc of [slide, layout, master]) {
        const bg = path(doc?.documentElement, P, "cSld", "bg");
        if (bg) return bg;
      }
      return null;
    },
  };
}

// ⚠️ PresentationML and DrawingML INTERLEAVE: a `p:` element routinely holds an `a:`
// child (`<p:spPr><a:xfrm>`, `<p:txBody><a:bodyPr>`). So a chain must switch namespace
// mid-walk — `path(sp, P, "spPr", "xfrm")` looks for a `p:xfrm` that does not exist and
// quietly finds nothing, which reads downstream as "this shape has no geometry" rather
// than as an error. `path` is only safe for a same-namespace chain; step explicitly
// whenever the prefix changes. `parsePptx.test.ts` covers every one of these.

/** The `<p:txBody>` of a shape, or null. */
export const txBodyOf = (sp: Element | null): Element | null => child(sp, P, "txBody");

/** The `<a:bodyPr>` of a shape's text body — `p:txBody` → `a:bodyPr`. */
export const bodyPrOf = (sp: Element | null): Element | null => child(txBodyOf(sp), A, "bodyPr");

/** The `<a:lstStyle>` `<a:lvlNpPr>` for `level` on a shape's own text body.
 *
 *  Paragraph-LEVEL properties (the bullet, the alignment) live on this element, and
 *  character properties on its `<a:defRPr>` child. Both inherit down the same chain, so
 *  the walk must expose the `lvlNpPr` and let the caller take what it needs — reading
 *  only `defRPr` silently drops every bullet a deck declares on its master, which is
 *  where PowerPoint actually puts them. */
export function lstStyleLvlPPr(sp: Element | null, level: number): Element | null {
  const lst = child(txBodyOf(sp), A, "lstStyle");
  return child(lst, A, `lvl${Math.min(9, level + 1)}pPr`);
}

/** A shape's `<a:xfrm>`, or undefined — the caller then walks the inheritance. */
export function xfrmOf(sp: Element | null): { x: number; y: number; w: number; h: number; rot?: number } | undefined {
  const xfrm = child(child(sp, P, "spPr"), A, "xfrm");
  const off = child(xfrm, A, "off");
  const ext = child(xfrm, A, "ext");
  const x = num(attr(off, "x"));
  const y = num(attr(off, "y"));
  const w = num(attr(ext, "cx"));
  const h = num(attr(ext, "cy"));
  if (x === undefined || y === undefined || w === undefined || h === undefined) return undefined;
  const rot = num(attr(xfrm, "rot"));
  return { x, y, w, h, rot: rot === undefined ? undefined : rot / 60000 };
}

export { allShapes, ph as placeholderOf, normalizeType, shapeTree };
export type { PhKey };
