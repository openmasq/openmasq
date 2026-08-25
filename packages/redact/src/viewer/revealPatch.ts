// INCREMENTAL reveal/re-redact over an already-painted page. The original
// pixels under every redaction box are captured BEFORE the first paint; a
// reveal toggle then only restores/repaints those patches — no pdf.js reload,
// no full re-render, no skeleton flash. Apply is restore-THEN-repaint, so it is
// idempotent whatever the previous state.
import type { RedactBox } from "./pdfMatch";
import { PAD_Y_LINE, inflate, paintScanBox, paintValueBox } from "./paintBox";
import type { Matrix } from "./pageWords";
import { mul } from "./pageWords";

/** The 2D-context surface this module needs (stubbable in tests). */
export type PatchCtx = Pick<
  CanvasRenderingContext2D,
  | "fillRect" | "fillText" | "save" | "restore" | "beginPath" | "rect" | "clip" | "fill"
  | "getImageData" | "putImageData" | "measureText"
> & { font: string; fillStyle: unknown; textBaseline: unknown };

/** One redaction region: its device-px rect, the ORIGINAL pixels under it, the
 *  consumer box (CSS px) and how to re-paint the redaction over it. */
export interface RevealPatch {
  x: number;
  y: number;
  w: number;
  h: number;
  pixels: ImageData;
  box: RedactBox;
  paint: (ctx: PatchCtx) => void;
}

/** Integer-aligned, canvas-clamped capture of the pixels under a device-px rect. */
function capture(
  ctx: PatchCtx,
  rect: { left: number; top: number; w: number; h: number },
  cw: number,
  ch: number,
): { x: number; y: number; w: number; h: number; pixels: ImageData } | null {
  const x = Math.max(0, Math.floor(rect.left));
  const y = Math.max(0, Math.floor(rect.top));
  const w = Math.min(cw, Math.ceil(rect.left + rect.w)) - x;
  const h = Math.min(ch, Math.ceil(rect.top + rect.h)) - y;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h, pixels: ctx.getImageData(x, y, w, h) };
}

/** Build (and initially paint, unless revealed) the patch of ONE text-layer
 *  segment: same proportional-metrics box the painter always used. Returns the
 *  consumer box (CSS px) + the patch, or null for a degenerate rect. */
export function textSegmentPatch(
  ctx: PatchCtx,
  a: {
    item: { str: string; width?: number; transform?: number[] };
    segStart: number;
    segEnd: number;
    first: boolean; // the occurrence's FIRST segment carries the fake
    vpTransform: Matrix;
    scale: number;
    dpr: number;
    rep: { real: string; fake: string; tone: string; kind?: string };
    revealed: boolean;
    canvasW: number;
    canvasH: number;
  },
): { box: RedactBox; patch: RevealPatch | null } {
  const m = mul(a.vpTransform, (a.item.transform as number[]) ?? [1, 0, 0, 1, 0, 0]);
  const fh = Math.hypot(m[2], m[3]) || 12 * a.dpr; // glyph height (device px)
  const wpx = (a.item.width || 0) * a.scale * a.dpr || fh;
  const baseline = m[5];
  const top = baseline - fh * 0.85;
  const h = fh * 1.12;
  const value = a.item.str.slice(a.segStart, a.segEnd);
  ctx.font = `${fh * 0.82}px Helvetica, Arial, sans-serif`;
  const totalW = ctx.measureText(a.item.str).width || a.item.str.length || 1;
  const k = wpx / totalW;
  const left = m[4] + ctx.measureText(a.item.str.slice(0, a.segStart)).width * k;
  const boxW = Math.max(ctx.measureText(value).width * k, fh * 0.35);

  const box: RedactBox = {
    left: left / a.dpr,
    top: top / a.dpr,
    w: boxW / a.dpr,
    h: h / a.dpr,
    original: value,
    real: a.rep.real,
    fake: a.rep.fake,
    tone: a.rep.tone,
    kind: a.rep.kind,
    revealed: a.revealed,
  };
  // ONE painter for both geometries (`paintBox.ts`): padded + rounded fill, and the fake
  // TYPESET TO FIT instead of clipped. The fake is drawn once, in the occurrence's FIRST
  // segment; later segments of a split value get the plain tone fill.
  const paint = (c: PatchCtx) =>
    paintValueBox(c as CanvasRenderingContext2D, {
      left,
      top,
      w: boxW,
      h,
      fake: a.first ? a.rep.fake : "",
      tone: a.rep.tone,
    }, {
      // The document's OWN baseline: sitting the fake on it is what makes the
      // replacement read as part of the line rather than as a sticker over it.
      baseline,
      idealFont: fh * 0.82,
      // `h` above is already a LINE box (1.12 × font height), so it has no vertical room
      // to grow into — padding it reaches into the next line's box. Horizontal padding
      // still applies. See `PAD_Y_LINE`.
      padY: PAD_Y_LINE,
    });
  // Capture the INFLATED rect — SAME padY as the paint, or the reveal restores a rect
  // that differs from the painted one (a coloured halo, or an uncovered strip).
  const cap = capture(ctx, inflate({ left, top, w: boxW, h }, PAD_Y_LINE), a.canvasW, a.canvasH);
  if (!a.revealed) paint(ctx);
  return { box, patch: cap ? { ...cap, box, paint } : null };
}

/** Build (and initially paint, unless revealed) the patch of ONE OCR-geometry
 *  box (`deviceBox` in device px — the scanned-page fallback style). */
export function scanBoxPatch(
  ctx: PatchCtx,
  deviceBox: RedactBox,
  dpr: number,
  canvasW: number,
  canvasH: number,
): { box: RedactBox; patch: RevealPatch | null } {
  const box: RedactBox = {
    ...deviceBox,
    left: deviceBox.left / dpr,
    top: deviceBox.top / dpr,
    w: deviceBox.w / dpr,
    h: deviceBox.h / dpr,
  };
  const paint = (c: PatchCtx) => paintScanBox(c as CanvasRenderingContext2D, deviceBox);
  const cap = capture(
    ctx,
    inflate({ left: deviceBox.left, top: deviceBox.top, w: deviceBox.w, h: deviceBox.h }),
    canvasW,
    canvasH,
  );
  if (!deviceBox.revealed) paint(ctx);
  return { box, patch: cap ? { ...cap, box, paint } : null };
}

/**
 * Re-apply a reveal set to a painted page: restore EVERY patch's ORIGINAL pixels, THEN
 * repaint the redaction over the non-revealed ones. Returns the boxes with their
 * `revealed` flags recomputed (the consumer rebuilds its marks from them).
 *
 * ⚠️ The two passes are a security boundary, not tidiness. Patches OVERLAP — boxes are
 * padded horizontally and neighbouring lines sit close — so restoring and repainting one
 * at a time let a later REVEALED patch put original pixels back over a strip an earlier
 * non-revealed patch had just covered: real glyphs of a value the user never revealed,
 * left on screen and, on the send-as-images path, in the wire. Restoring everything first
 * makes the paint pass the last writer on every shared pixel, whatever the patch order.
 * Pinned in `revealPatch.test.ts` ("cannot re-expose").
 */
export function applyRevealToPage(
  ctx: PatchCtx,
  patches: RevealPatch[],
  reveal?: ReadonlySet<string>,
): RedactBox[] {
  for (const p of patches) ctx.putImageData(p.pixels, p.x, p.y);
  const boxes: RedactBox[] = [];
  for (const p of patches) {
    const revealed = !!reveal?.has(p.box.real);
    if (!revealed) p.paint(ctx);
    boxes.push({ ...p.box, revealed });
  }
  return boxes;
}
