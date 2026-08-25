import type { CSSProperties } from "react";
import { runCss, type RunStyle } from "../ooxml/textStyle";
import type { DocxBlock, DocxPara } from "./docxModel";

// The pure half of the docx render: model → CSS + list grouping. Kept out of the .tsx
// so it is unit-testable and the component stays presentational (repo convention:
// logic in .ts, presentation in .tsx).
//
// Character formatting is NOT here: `../ooxml/textStyle.ts` owns `RunStyle` + `runCss`
// because the pptx viewer needs the identical mapping. Re-exported so this stays the
// one import site for the docx render.

export { runCss };
export type { RunStyle };

/** Consecutive list paragraphs collapsed into one list block. Word has no list
 *  element — it marks each paragraph with `<w:numPr>` and leaves the grouping to the
 *  renderer. Emitting one `<ul>` per item would render a gap between every bullet. */
export interface DocxList {
  kind: "list";
  ordered: boolean;
  items: DocxPara[];
}

export type LaidOutBlock = DocxBlock | DocxList;

export function groupBlocks(blocks: DocxBlock[]): LaidOutBlock[] {
  const out: LaidOutBlock[] = [];
  for (const b of blocks) {
    if (b.kind === "para" && b.list) {
      const last = out[out.length - 1];
      // Only merge into a run of items of the SAME kind: a numbered list directly
      // followed by a bulleted one is two lists, and merging them would renumber the
      // bullets.
      if (last?.kind === "list" && last.ordered === b.list.ordered) last.items.push(b);
      else out.push({ kind: "list", ordered: b.list.ordered, items: [b] });
    } else out.push(b);
  }
  return out;
}

/** A paragraph's block-level formatting → a React style object. */
export function paraCss(p: DocxPara): CSSProperties {
  const css: CSSProperties = {};
  if (p.align) css.textAlign = p.align;
  if (p.indentPx) css.marginLeft = `${p.indentPx}px`;
  if (p.spaceBeforePt !== undefined) css.marginTop = `${p.spaceBeforePt}pt`;
  if (p.spaceAfterPt !== undefined) css.marginBottom = `${p.spaceAfterPt}pt`;
  if (p.background) css.backgroundColor = p.background;
  return css;
}

/** A list item's extra indent for its nesting level. Word nests by `<w:ilvl>` on a
 *  flat paragraph list rather than by nested elements, so the depth is rendered as
 *  indent instead of real `<ul>` nesting — the same visual result without having to
 *  reconstruct a tree from a flat sequence that may skip levels. */
export function listItemCss(p: DocxPara): CSSProperties {
  const level = p.list?.level ?? 0;
  const css = paraCss(p);
  if (level > 0) css.marginLeft = `${(p.indentPx ?? 0) + level * 24}px`;
  return css;
}

/** The container's base typography, from docDefaults — so a run that inherits
 *  everything still lands on the document's font rather than the app's. */
export function docBaseCss(base: RunStyle | undefined, bodyWidthPx: number | undefined): CSSProperties {
  const css: CSSProperties = base ? runCss(base) : {};
  // Never let docDefaults' weight/style leak onto the container: a run states its own,
  // and an inherited bold would double-apply.
  delete css.textTransform;
  if (bodyWidthPx) css.maxWidth = `${Math.round(bodyWidthPx)}px`;
  return css;
}
