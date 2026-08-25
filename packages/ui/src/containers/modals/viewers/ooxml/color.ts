import { A, attr, attrNS, child, children, num, path } from "./xml";
import { pctToRatio } from "./units";

// DrawingML colour resolution — shared by docx (`<w:color w:themeColor>`) and pptx
// (`<a:solidFill><a:schemeClr>`). A colour in OOXML is rarely a literal: it is a
// SLOT NAME resolved through the theme, optionally remapped by the slide master, then
// bent by modifiers. Skip any link in that chain and text renders black-on-black or
// simply wrong — silently, since there is no error to raise.
//
//   <a:schemeClr val="tx1"><a:lumMod val="75000"/></a:schemeClr>
//        │                      └── 75% of the slot's luminance
//        └── "tx1" → clrMap (master) → "dk1" → clrScheme (theme) → #000000

/** The twelve theme slots, as spelled in `<a:clrScheme>`. */
export type SchemeSlot =
  | "dk1" | "lt1" | "dk2" | "lt2"
  | "accent1" | "accent2" | "accent3" | "accent4" | "accent5" | "accent6"
  | "hlink" | "folHlink";

export type ClrScheme = Partial<Record<SchemeSlot, string>>;
/** Slide-master `<p:clrMap>`: the names a SLIDE uses (`tx1`, `bg1`) → theme slots. */
export type ClrMap = Record<string, string>;

/** docx spells the same slots differently from DrawingML. `<w:color w:themeColor="text1"/>`
 *  is DrawingML's `dk1`. Mapping them here keeps one resolver for both formats. */
const DOCX_THEME_SLOT: Record<string, SchemeSlot> = {
  text1: "dk1", text2: "dk2",
  background1: "lt1", background2: "lt2",
  dark1: "dk1", dark2: "dk2", light1: "lt1", light2: "lt2",
  accent1: "accent1", accent2: "accent2", accent3: "accent3",
  accent4: "accent4", accent5: "accent5", accent6: "accent6",
  hyperlink: "hlink", followedHyperlink: "folHlink",
};

const HEX6 = /^[0-9a-f]{6}$/i;
/** A DrawingML preset name (`<a:prstClr val="red"/>`). The preset vocabulary is the
 *  X11/CSS colour-name set, so it passes through to CSS — but only after an
 *  allow-list shape check: this string comes from the untrusted file and ends up in a
 *  style value. Letters only, nothing that could carry a second declaration. */
const CSS_NAME = /^[a-z]{3,24}$/i;

const clamp = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));

// A hex colour travels through this module BARE — six chars, no `#` — and only gets
// its `#` at the moment it becomes a CSS value. The mixed convention is not cosmetic:
// with some helpers returning `#rrggbb` and others `rrggbb`, a `slice(1)` to drop the
// hash silently shifts the channels by one nibble on the bare form (#ff0000 read as
// 240,0,0). Keep every internal value bare. `ooxml.test.ts` pins the alpha case.
const toHex = (r: number, g: number, b: number): string =>
  [r, g, b].map((c) => clamp(c).toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string): [number, number, number] => [
  parseInt(hex.slice(0, 2), 16),
  parseInt(hex.slice(2, 4), 16),
  parseInt(hex.slice(4, 6), 16),
];

/** Parse a theme part's `<a:clrScheme>` into slot → `rrggbb`. A slot holds either an
 *  `<a:srgbClr val>` or an `<a:sysClr lastClr>` (the system colour's last-rendered
 *  value — the only concrete thing a viewer outside Windows can use). */
export function parseClrScheme(themeDoc: Document | undefined): ClrScheme {
  const scheme = path(themeDoc?.documentElement, A, "themeElements", "clrScheme");
  if (!scheme) return {};
  const out: ClrScheme = {};
  for (const slot of scheme.children) {
    if (slot.namespaceURI !== A) continue;
    const srgb = attr(child(slot, A, "srgbClr"), "val");
    const sys = attr(child(slot, A, "sysClr"), "lastClr");
    const hex = srgb ?? sys;
    if (hex && HEX6.test(hex)) out[slot.localName as SchemeSlot] = hex.toLowerCase();
  }
  return out;
}

/** Parse a slide master's `<p:clrMap>` (attributes: `bg1="lt1" tx1="dk1" …`). */
export function parseClrMap(el: Element | null | undefined): ClrMap {
  const out: ClrMap = {};
  if (!el) return out;
  for (const a of el.attributes) out[a.name] = a.value;
  return out;
}

// ── Modifiers ───────────────────────────────────────────────────────────────────
// Applied in sRGB rather than linear-light. OOXML defines shade/tint in linearised
// gamma; the difference is a few perceptual units on a mid-tone, invisible in a
// document preview and not worth the extra conversion here. Named so a future reader
// knows it is a deliberate approximation, not an oversight.

const luminance = (r: number, g: number, b: number): number => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

function applyLum(hex: string, mod: number | undefined, off: number | undefined): string {
  if (mod === undefined && off === undefined) return hex;
  const [r, g, b] = fromHex(hex);
  const l = luminance(r, g, b);
  const target = Math.max(0, Math.min(1, l * (mod ?? 1) + (off ?? 0)));
  if (l === 0) return toHex(target * 255, target * 255, target * 255);
  const k = target / l;
  return toHex(r * k, g * k, b * k);
}

/** Resolve a DrawingML colour ELEMENT (`<a:srgbClr>`, `<a:schemeClr>`, `<a:sysClr>`,
 *  `<a:prstClr>`) to a CSS colour, applying its child modifiers. `map` is the slide
 *  master's clrMap (pptx); omit it for docx, where slots are already theme slots. */
export function resolveColorEl(
  el: Element | null | undefined,
  scheme: ClrScheme,
  map?: ClrMap,
): string | undefined {
  if (!el) return undefined;
  let hex: string | undefined;

  if (el.localName === "srgbClr") {
    const v = attr(el, "val");
    if (v && HEX6.test(v)) hex = v.toLowerCase();
  } else if (el.localName === "sysClr") {
    const v = attr(el, "lastClr");
    if (v && HEX6.test(v)) hex = v.toLowerCase();
  } else if (el.localName === "schemeClr") {
    const raw = attr(el, "val");
    if (raw) {
      // The clrMap indirection: a slide says `tx1`, the master says tx1→dk1, the
      // theme says dk1→#000000. Without the map, `tx1` matches no slot and the text
      // falls back to the default ink — which is right often enough to hide the bug.
      const slot = (map?.[raw] ?? raw) as SchemeSlot;
      hex = scheme[slot];
      // `phClr` is a placeholder-colour reference used inside theme style definitions;
      // it has no value outside that context, so leave it to the caller's default.
    }
  } else if (el.localName === "prstClr") {
    const v = attr(el, "val");
    if (v && CSS_NAME.test(v)) return v.toLowerCase();
  }
  if (!hex) return undefined;

  const pct = (name: string): number | undefined => {
    const v = num(attr(child(el, A, name), "val"));
    return v === undefined ? undefined : pctToRatio(v);
  };
  hex = applyLum(hex, pct("lumMod"), pct("lumOff"));

  const shade = pct("shade");
  if (shade !== undefined) {
    const [r, g, b] = fromHex(hex);
    hex = toHex(r * shade, g * shade, b * shade);
  }
  const tint = pct("tint");
  if (tint !== undefined) {
    const [r, g, b] = fromHex(hex);
    hex = toHex(r * tint + 255 * (1 - tint), g * tint + 255 * (1 - tint), b * tint + 255 * (1 - tint));
  }
  const alpha = pct("alpha");
  if (alpha !== undefined && alpha < 1) {
    const [r, g, b] = fromHex(hex);
    return `rgba(${clamp(r)}, ${clamp(g)}, ${clamp(b)}, ${Math.round(alpha * 100) / 100})`;
  }
  return `#${hex}`;
}

/** The colour of an `<a:solidFill>` child of `el`, if any. */
export function solidFill(el: Element | null | undefined, scheme: ClrScheme, map?: ClrMap): string | undefined {
  const fill = child(el, A, "solidFill");
  if (!fill) return undefined;
  const first = [...fill.children].find((c) => c.namespaceURI === A);
  return resolveColorEl(first, scheme, map);
}

/**
 * Resolve a docx `<w:color>` / `<w:highlight>`-style element: an explicit
 * `w:val="RRGGBB"`, or a `w:themeColor` slot bent by `w:themeTint`/`w:themeShade`
 * (a HEX BYTE — "99" is 0x99/255 ≈ 60% — not a percentage like DrawingML's).
 * `w:val="auto"` means "let the renderer decide" → undefined (inherit).
 */
export function resolveDocxColor(el: Element | null | undefined, ns: string, scheme: ClrScheme): string | undefined {
  if (!el) return undefined;
  const themeColor = attrNS(el, ns, "themeColor");
  if (themeColor) {
    const slot = DOCX_THEME_SLOT[themeColor];
    let hex = slot ? scheme[slot] : undefined;
    if (!hex) return undefined;
    const byte = (name: string): number | undefined => {
      const v = attrNS(el, ns, name);
      if (!v || !/^[0-9a-f]{2}$/i.test(v)) return undefined;
      return parseInt(v, 16) / 255;
    };
    const shade = byte("themeShade");
    const tint = byte("themeTint");
    const [r, g, b] = fromHex(hex);
    if (shade !== undefined) hex = toHex(r * shade, g * shade, b * shade);
    else if (tint !== undefined)
      hex = toHex(r * tint + 255 * (1 - tint), g * tint + 255 * (1 - tint), b * tint + 255 * (1 - tint));
    return `#${hex}`;
  }
  const val = attrNS(el, ns, "val");
  if (!val || val === "auto") return undefined;
  if (HEX6.test(val)) return `#${val.toLowerCase()}`;
  // `<w:highlight w:val="yellow"/>` — a preset name, same allow-list as prstClr.
  if (CSS_NAME.test(val)) return val.toLowerCase();
  return undefined;
}

/** Every direct DrawingML child element of `el` (helper for callers walking fills). */
export const drawingChildren = (el: Element | null | undefined, name: string): Element[] => children(el, A, name);
