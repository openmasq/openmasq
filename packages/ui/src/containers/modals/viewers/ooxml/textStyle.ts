import type { CSSProperties } from "react";

// Character formatting, shared by the docx and pptx viewers.
//
// The two formats spell it differently in the XML (`<w:b/>` vs `<a:rPr b="1"/>`,
// half-points vs hundredths) — that is each parser's problem. But they mean the SAME
// thing and target the SAME CSS, so the type and the CSS mapping live here once rather
// than being re-declared per format (rule 9: one home, no "keep in sync" twins).

/** Every field is optional and means "inherit" when absent. `false` is an EXPLICIT
 *  override — a run that un-bolds itself inside a bold style — which is why these are
 *  `boolean | undefined` and never defaulted to `false`. */
export interface RunStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** CSS colour. */
  color?: string;
  /** CSS colour painted behind the text. */
  highlight?: string;
  /** Font size in POINTS — already converted from each format's own unit. */
  sizePt?: number;
  /** Font family name, as written in the file. */
  font?: string;
  vertAlign?: "super" | "sub";
  /** Rendered with `text-transform`, so the TEXT stays the document's real text. */
  caps?: boolean;
  smallCaps?: boolean;
}

/** Merge `over` onto `base`; a field `over` does not state is inherited. An explicit
 *  `false` DOES override — hence `!== undefined` rather than a truthy test, which
 *  would drop every deliberate un-bolding. */
export function mergeStyle<T extends object>(base: T, over: T): T {
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) if (v !== undefined) (out as any)[k] = v;
  return out;
}

/**
 * A run's formatting → a React style object.
 *
 * This is the sanctioned inline-style case (rule 6): the values are per-item data read
 * from the document at runtime, not static design. There is no Tailwind class for
 * "whatever colour this particular run happens to be".
 *
 * `caps` becomes `textTransform`, never an uppercased string — the TEXT must stay the
 * document's real text. A redaction matches BY VALUE, so uppercasing "Rebour" in the
 * model would stop it matching the vault and the mark would disappear from the very
 * view the user redacts in. Presentation-only, so the DOM still yields the real value
 * to a selection.
 */
export function runCss(r: RunStyle): CSSProperties {
  const css: CSSProperties = {};
  if (r.bold !== undefined) css.fontWeight = r.bold ? 700 : 400;
  if (r.italic !== undefined) css.fontStyle = r.italic ? "italic" : "normal";
  if (r.color) css.color = r.color;
  if (r.highlight) css.backgroundColor = r.highlight;
  if (r.sizePt !== undefined) css.fontSize = `${r.sizePt}pt`;
  // Quote the family and strip what could terminate the value: this name comes from
  // an untrusted file and lands in a style declaration.
  if (r.font) css.fontFamily = `"${r.font.replace(/["\\]/g, "")}", serif`;
  if (r.caps) css.textTransform = "uppercase";
  if (r.smallCaps) css.fontVariant = "small-caps";
  if (r.vertAlign) css.verticalAlign = r.vertAlign;
  if (r.vertAlign) css.fontSize = r.sizePt !== undefined ? `${r.sizePt * 0.75}pt` : "0.75em";

  const lines: string[] = [];
  if (r.underline) lines.push("underline");
  if (r.strike) lines.push("line-through");
  // One combined declaration: two separate ones would overwrite each other, so a run
  // that is both underlined and struck would lose the first.
  if (lines.length) css.textDecoration = lines.join(" ");
  else if (r.underline === false || r.strike === false) css.textDecoration = "none";
  return css;
}
