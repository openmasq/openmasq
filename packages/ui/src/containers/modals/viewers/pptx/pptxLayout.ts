import type { CSSProperties } from "react";
import type { PptxFrame, PptxPara, PptxTextShape } from "./pptxModel";

// The pure half of the pptx render: model → CSS. Kept out of the .tsx (repo
// convention: logic in .ts, presentation in .tsx) and unit-tested.
//
// THE SCALING DECISION, because it is not obvious and it is the whole reason this
// render can be faithful:
//
// A slide's shapes are absolute px in the deck's OWN coordinate space, and its font
// sizes are absolute POINTS. Those two must scale TOGETHER. Positioning shapes with
// percentages would fit the box responsively but leave the type at its literal pt size,
// so a slide shrunk to fit the panel would keep 44pt titles and overflow every box —
// fidelity lost exactly where it is easiest to notice.
//
// So the slide renders at its TRUE size and the whole plane is `transform: scale(k)`.
// One transform moves geometry and type in lockstep, and the layout inside each box
// (wrapping, anchoring) is computed at true size, which is the size the deck was
// authored against.

/** The scale that fits a slide of `slideW` into `availW`. Never upscales past 1: a
 *  slide blown up beyond its authored size looks like a rendering bug, and the panel
 *  is not a projector. Returns 1 before the container has been measured (`availW` 0),
 *  so the first paint is the true size rather than a collapsed one. */
export function slideScale(slideW: number, availW: number): number {
  if (!availW || !slideW) return 1;
  return Math.min(1, availW / slideW);
}

/** The outer element: reserves the SCALED footprint in the flow. `transform` does not
 *  affect layout, so without this the surrounding page would still reserve the slide's
 *  full unscaled height and leave a gap under every slide. */
export function slideBoxCss(slideW: number, slideH: number, scale: number): CSSProperties {
  return { width: `${slideW * scale}px`, height: `${slideH * scale}px` };
}

/** The scaled plane: true-size, pinned top-left, scaled as one unit. */
export function slidePlaneCss(slideW: number, slideH: number, scale: number): CSSProperties {
  return {
    width: `${slideW}px`,
    height: `${slideH}px`,
    transform: `scale(${scale})`,
    transformOrigin: "top left",
  };
}

/** A shape's box on the plane. Rotation is applied about the box's centre, which is
 *  what `<a:xfrm rot>` means. */
export function frameCss(frame: PptxFrame): CSSProperties {
  const css: CSSProperties = {
    left: `${frame.x}px`,
    top: `${frame.y}px`,
    width: `${frame.w}px`,
    height: `${frame.h}px`,
  };
  if (frame.rot) css.transform = `rotate(${frame.rot}deg)`;
  return css;
}

/** A text box: the vertical anchor is `<a:bodyPr anchor>`, which flexbox expresses
 *  directly — PowerPoint centres text in the BOX, not in the text's own line box. */
export function textShapeCss(shape: PptxTextShape): CSSProperties {
  const css: CSSProperties = {
    ...frameCss(shape.frame),
    display: "flex",
    flexDirection: "column",
    justifyContent:
      shape.anchor === "center" ? "center" : shape.anchor === "bottom" ? "flex-end" : "flex-start",
  };
  if (shape.fill) css.background = shape.fill;
  if (shape.pad)
    css.padding = `${shape.pad.t}px ${shape.pad.r}px ${shape.pad.b}px ${shape.pad.l}px`;
  return css;
}

/** Indent per outline level. PowerPoint's own default step is 0.5in (48px at 96dpi);
 *  a deck that states its own `marL` is not read here, so this is the floor. */
export function paraCss(para: PptxPara): CSSProperties {
  const css: CSSProperties = {};
  if (para.align) css.textAlign = para.align;
  if (para.level > 0) css.marginLeft = `${para.level * 24}px`;
  return css;
}

/** The bullet shown before a paragraph, or "" for none. `#` is our marker for
 *  `<a:buAutoNum>` — the real number depends on the paragraph's position in its run of
 *  siblings, which the RENDERER counts (a parser cannot, without replaying the list). */
export function bulletFor(para: PptxPara, autoNumIndex: number): string {
  if (!para.bullet) return "";
  return para.bullet === "#" ? `${autoNumIndex}.` : para.bullet;
}
