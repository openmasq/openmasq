import { W, attrNS, child, children, num, onOff, path } from "../ooxml/xml";
import { halfPointsToPt, twipsToPt, twipsToPx } from "../ooxml/units";
import { resolveDocxColor, type ClrScheme } from "../ooxml/color";
import { mergeStyle, type RunStyle } from "../ooxml/textStyle";
import type { Align } from "./docxModel";

// docx style resolution. A run's real formatting is almost never written on the run:
// it is assembled down a chain, weakest first —
//
//   docDefaults  →  named style (basedOn → … → the style itself)  →  direct <w:rPr>
//
// with each layer overriding only the fields it states. Read just the run's own <w:rPr>
// (the tempting shortcut) and a heading renders as body text: its size and colour live
// on the "Heading1" style, not on the run.

export interface ParaStyle {
  align?: Align;
  indentPx?: number;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  background?: string;
  /** From `<w:outlineLvl>` or a Heading-N style name — 1-based. */
  headingLevel?: number;
  numId?: string;
  ilvl?: number;
}

interface StyleDef {
  id: string;
  name?: string;
  basedOn?: string;
  rPr: Element | null;
  pPr: Element | null;
}

export interface DocxStyles {
  /** docDefaults' run formatting — the base every run starts from. */
  defaultRun: RunStyle;
  defaultPara: ParaStyle;
  /** Resolve a `<w:pStyle w:val>` id to its accumulated run formatting. */
  runStyleFor(styleId: string | undefined): RunStyle;
  paraStyleFor(styleId: string | undefined): ParaStyle;
  /** `<w:numId>` + `<w:ilvl>` → whether that list level is ordered. */
  isOrdered(numId: string | undefined, ilvl: number): boolean;
}

/** `mergeStyle` from `../ooxml/textStyle` under the name this file's chain reads best
 *  with — the inherit-vs-explicit-false rule it implements is identical for both
 *  formats, so there is one implementation (rule 9). */
const merge = mergeStyle;

/** Read a `<w:rPr>` into a RunStyle. Only what the element states — absent stays
 *  undefined so the caller's merge can inherit it. */
export function readRunProps(rPr: Element | null, scheme: ClrScheme): RunStyle {
  if (!rPr) return {};
  const sz = num(attrNS(child(rPr, W, "sz"), W, "val"));
  const fonts = child(rPr, W, "rFonts");
  const vert = attrNS(child(rPr, W, "vertAlign"), W, "val");
  const u = child(rPr, W, "u");
  // <w:u w:val="none"/> is an explicit OFF, distinct from a bare <w:u/> (= single).
  const uVal = attrNS(u, W, "val");
  const shd = child(rPr, W, "shd");
  return {
    bold: onOff(child(rPr, W, "b"), W),
    italic: onOff(child(rPr, W, "i"), W),
    strike: onOff(child(rPr, W, "strike"), W),
    caps: onOff(child(rPr, W, "caps"), W),
    smallCaps: onOff(child(rPr, W, "smallCaps"), W),
    underline: u ? uVal !== "none" : undefined,
    sizePt: sz === undefined ? undefined : halfPointsToPt(sz),
    font: attrNS(fonts, W, "ascii") ?? attrNS(fonts, W, "hAnsi") ?? undefined,
    color: resolveDocxColor(child(rPr, W, "color"), W, scheme),
    // Two ways to paint behind a run: <w:highlight> (a preset name) and <w:shd
    // w:fill> (a hex). A file can use either; reading only the first loses the other.
    highlight:
      resolveDocxColor(child(rPr, W, "highlight"), W, scheme) ??
      (attrNS(shd, W, "fill") && attrNS(shd, W, "fill") !== "auto"
        ? resolveDocxColorFill(shd, scheme)
        : undefined),
    vertAlign: vert === "superscript" ? "super" : vert === "subscript" ? "sub" : undefined,
  };
}

/** `<w:shd w:fill="RRGGBB">` — the fill lives on a different attribute than `w:val`,
 *  so it needs its own read rather than `resolveDocxColor`'s `w:val` path. */
function resolveDocxColorFill(shd: Element | null, scheme: ClrScheme): string | undefined {
  const fill = attrNS(shd, W, "fill");
  if (!fill || fill === "auto") return undefined;
  if (/^[0-9a-f]{6}$/i.test(fill)) return `#${fill.toLowerCase()}`;
  return resolveDocxColor(shd, W, scheme);
}

/** Read a `<w:pPr>` into a ParaStyle. */
export function readParaProps(pPr: Element | null, scheme: ClrScheme): ParaStyle {
  if (!pPr) return {};
  const jc = attrNS(child(pPr, W, "jc"), W, "val");
  const ind = child(pPr, W, "ind");
  const spacing = child(pPr, W, "spacing");
  const numPr = child(pPr, W, "numPr");
  const outline = num(attrNS(child(pPr, W, "outlineLvl"), W, "val"));
  const left = num(attrNS(ind, W, "left")) ?? num(attrNS(ind, W, "start"));
  const before = num(attrNS(spacing, W, "before"));
  const after = num(attrNS(spacing, W, "after"));
  return {
    align:
      jc === "center" ? "center"
      : jc === "right" || jc === "end" ? "right"
      : jc === "both" || jc === "distribute" ? "justify"
      : jc === "left" || jc === "start" ? "left"
      : undefined,
    indentPx: left === undefined ? undefined : twipsToPx(left),
    spaceBeforePt: before === undefined ? undefined : twipsToPt(before),
    spaceAfterPt: after === undefined ? undefined : twipsToPt(after),
    background: resolveDocxColorFill(child(pPr, W, "shd"), scheme),
    headingLevel: outline === undefined ? undefined : Math.min(6, outline + 1),
    numId: attrNS(child(numPr, W, "numId"), W, "val"),
    ilvl: num(attrNS(child(numPr, W, "ilvl"), W, "val")),
  };
}

/** A style name like "heading 1" / "Heading1" → 1. Word writes the display name with
 *  a space and lowercase; the styleId is usually "Heading1". Accept both. */
function headingFromName(name: string | undefined, id: string): number | undefined {
  const m = /^heading\s*([1-9])$/i.exec(name ?? "") ?? /^heading([1-9])$/i.exec(id);
  return m ? Number(m[1]) : undefined;
}

/**
 * Build the style resolver from `word/styles.xml` + `word/numbering.xml`.
 * Both parts are OPTIONAL — a Quartz/macOS-exported docx ships neither and puts every
 * property directly on the run (both repo fixtures are exactly that shape). Absent
 * parts must degrade to "no inherited formatting", never throw.
 */
export function buildStyles(
  stylesDoc: Document | undefined,
  numberingDoc: Document | undefined,
  scheme: ClrScheme,
): DocxStyles {
  const defs = new Map<string, StyleDef>();
  const root = stylesDoc?.documentElement;
  for (const s of children(root, W, "style")) {
    const id = attrNS(s, W, "styleId");
    if (!id) continue;
    defs.set(id, {
      id,
      name: attrNS(child(s, W, "name"), W, "val"),
      basedOn: attrNS(child(s, W, "basedOn"), W, "val"),
      rPr: child(s, W, "rPr"),
      pPr: child(s, W, "pPr"),
    });
  }

  const docDefaults = child(root, W, "docDefaults");
  const defaultRun = readRunProps(path(docDefaults, W, "rPrDefault", "rPr"), scheme);
  const defaultPara = readParaProps(path(docDefaults, W, "pPrDefault", "pPr"), scheme);

  /** The basedOn chain, root-first, so a merge applies ancestors before descendants.
   *  `seen` breaks a cyclic basedOn — malformed, but a file we did not write must not
   *  be able to hang the viewer in an infinite walk. */
  const chain = (styleId: string | undefined): StyleDef[] => {
    const out: StyleDef[] = [];
    const seen = new Set<string>();
    let cur = styleId ? defs.get(styleId) : undefined;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.unshift(cur);
      cur = cur.basedOn ? defs.get(cur.basedOn) : undefined;
    }
    return out;
  };

  const runCache = new Map<string, RunStyle>();
  const paraCache = new Map<string, ParaStyle>();

  // numbering.xml: numId → abstractNumId → per-level numFmt. Two hops, because several
  // <w:num> can share one <w:abstractNum>.
  const numToAbstract = new Map<string, string>();
  const abstractFmt = new Map<string, Map<number, string>>();
  const numRoot = numberingDoc?.documentElement;
  for (const n of children(numRoot, W, "num")) {
    const id = attrNS(n, W, "numId");
    const aid = attrNS(child(n, W, "abstractNumId"), W, "val");
    if (id && aid) numToAbstract.set(id, aid);
  }
  for (const an of children(numRoot, W, "abstractNum")) {
    const aid = attrNS(an, W, "abstractNumId");
    if (!aid) continue;
    const lvls = new Map<number, string>();
    for (const lvl of children(an, W, "lvl")) {
      const i = num(attrNS(lvl, W, "ilvl"));
      const fmt = attrNS(child(lvl, W, "numFmt"), W, "val");
      if (i !== undefined && fmt) lvls.set(i, fmt);
    }
    abstractFmt.set(aid, lvls);
  }

  return {
    defaultRun,
    defaultPara,
    runStyleFor(styleId) {
      if (!styleId) return defaultRun;
      const hit = runCache.get(styleId);
      if (hit) return hit;
      let acc = defaultRun;
      for (const def of chain(styleId)) acc = merge(acc, readRunProps(def.rPr, scheme));
      runCache.set(styleId, acc);
      return acc;
    },
    paraStyleFor(styleId) {
      if (!styleId) return defaultPara;
      const hit = paraCache.get(styleId);
      if (hit) return hit;
      let acc = defaultPara;
      for (const def of chain(styleId)) acc = merge(acc, readParaProps(def.pPr, scheme));
      const def = defs.get(styleId);
      const lvl = def && headingFromName(def.name, def.id);
      if (lvl) acc = { ...acc, headingLevel: lvl };
      paraCache.set(styleId, acc);
      return acc;
    },
    isOrdered(numId, ilvl) {
      if (!numId) return false;
      const aid = numToAbstract.get(numId);
      const fmt = aid ? abstractFmt.get(aid)?.get(ilvl) : undefined;
      // "bullet" is the only unordered format; everything else (decimal, lowerRoman,
      // upperLetter…) is a numbered list. Default to a bullet when numbering.xml is
      // missing — an unnumbered bullet is a smaller lie than a wrong number.
      return fmt !== undefined && fmt !== "bullet" && fmt !== "none";
    },
  };
}

export const mergeRun = merge<RunStyle>;
