// The typed model a .docx parses INTO. The renderer walks this — it never receives
// an HTML string, and that is the security posture of this viewer rather than an
// aesthetic choice.
//
// A .docx is untrusted input. Convert one to markup and you inherit a sanitiser: a
// deny-list of tags/handlers/schemes, racing whatever the converter emits next.
// Parsing to a CLOSED model inverts the burden — the only nodes that can reach the DOM
// are the ones enumerated here, the only `src` that can exist is a `data:` URI built
// from sniffed raster bytes, and the file's text is only ever a React text child. There
// is no vector to strip, because no path leads from file content to markup (rule 7:
// enumerate what is permitted, never what is forbidden).

import type { RunStyle } from "../ooxml/textStyle";

export type { RunStyle };

export interface DocxRun extends RunStyle {
  kind: "run";
  text: string;
}

export interface DocxImage {
  kind: "image";
  /** A `data:` URI built from allow-listed raster bytes. Never a remote URL. */
  src: string;
  widthPx?: number;
  heightPx?: number;
  /** The file's own alt text, if any. Untrusted text — rendered as an attribute value
   *  by React, never as markup. */
  alt?: string;
}

export type DocxInline = DocxRun | DocxImage;

export type Align = "left" | "center" | "right" | "justify";

export interface DocxPara {
  kind: "para";
  inlines: DocxInline[];
  align?: Align;
  /** 1–6 when the paragraph's style is a heading — drives the semantic tag. */
  headingLevel?: number;
  /** Present ⇒ the paragraph is a list item. `level` is `<w:ilvl>` (0-based). */
  list?: { level: number; ordered: boolean };
  indentPx?: number;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  /** Paragraph shading (`<w:pPr><w:shd w:fill>`). */
  background?: string;
}

export interface DocxCell {
  /** A cell holds block content, not just text — nested paragraphs keep their own
   *  styling, so a bold cell renders bold rather than being flattened to a string. */
  blocks: DocxBlock[];
  /** `<w:gridSpan>` — a merged cell spans N grid columns. */
  colSpan?: number;
  background?: string;
}

export interface DocxTable {
  kind: "table";
  rows: DocxCell[][];
}

export type DocxBlock = DocxPara | DocxTable;

export interface DocxDoc {
  blocks: DocxBlock[];
  /** Page body width in px (page width minus margins) — the render is capped to it so
   *  the preview's line length matches the document's, not the panel's. */
  bodyWidthPx?: number;
  /** The document's default run style (docDefaults), applied as the container's base
   *  so a run that inherits everything still renders with the right font/size. */
  defaultStyle?: RunStyle;
}
