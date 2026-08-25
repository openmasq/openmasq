import type { RunStyle } from "../ooxml/textStyle";

// The typed model a .pptx parses INTO. Same posture as the docx one: React walks this,
// nothing here becomes markup, so there is no sanitiser to maintain (see
// `../docx/docxModel.ts`).
//
// The shape of the model differs from docx's on purpose, because the formats differ at
// the root: a .docx is a FLOW (the renderer decides where lines break, so we can never
// match Word exactly), while a .pptx is ABSOLUTE — every shape carries its own EMU
// offset and extent. So a slide is a list of positioned boxes and the render is
// geometrically exact, which the docx render structurally cannot be.

export type PptxRun = RunStyle & { text: string };

export interface PptxPara {
  runs: PptxRun[];
  align?: "left" | "center" | "right" | "justify";
  /** `<a:pPr lvl>` — the outline depth, 0-based. Drives indent AND which level of the
   *  placeholder's list style the run inherits from. */
  level: number;
  /** The bullet glyph, or undefined for `<a:buNone/>`. Presentation-only: it is NOT
   *  part of the slide's text, so it never reaches a selection or a redaction match. */
  bullet?: string;
}

/** A box on the slide, in CSS px relative to the slide's own coordinate space. */
export interface PptxFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Clockwise degrees (`<a:xfrm rot>` is 60000ths of a degree). */
  rot?: number;
}

export interface PptxTextShape {
  kind: "text";
  frame: PptxFrame;
  paras: PptxPara[];
  /** Vertical anchor inside the box (`<a:bodyPr anchor>`). */
  anchor?: "top" | "center" | "bottom";
  /** Solid shape fill, when it has one. */
  fill?: string;
  /** Inset padding in px (`<a:bodyPr lIns/tIns/rIns/bIns>`). */
  pad?: { l: number; t: number; r: number; b: number };
}

export interface PptxImageShape {
  kind: "image";
  frame: PptxFrame;
  /** A `data:` URI built from allow-listed raster bytes. Never a remote URL. */
  src: string;
  alt?: string;
}

export type PptxShape = PptxTextShape | PptxImageShape;

export interface PptxSlide {
  /** In z-order: the shape tree's document order IS the paint order, so the render
   *  must not sort them. */
  shapes: PptxShape[];
  background?: string;
}

export interface PptxDeck {
  slides: PptxSlide[];
  /** Slide size in px, from `<p:sldSz>`. Every frame is in this space, so the render
   *  scales the whole slide by one factor instead of scaling each shape. */
  widthPx: number;
  heightPx: number;
}
