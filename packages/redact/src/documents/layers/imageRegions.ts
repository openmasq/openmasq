// WHERE a PDF page paints its images — so a digital page whose ONLY unread content is an
// image (a logo, a stamp, a scanned insert) has OCR read those rectangles, not the whole page.
//
// Walks the page's pdf.js operator list, tracking the current transformation matrix the
// way pdf.js's canvas does (`save`/`restore`/`transform`, a form XObject's matrix), and
// bounds every image op that paints the UNIT SQUARE under that matrix. Fail CLOSED: an image
// op this walk cannot bound (the `…Repeat`/`…Group` variants pdf.js's optimiser emits, an
// image inside an annotation appearance or a tiling pattern, a non-finite matrix) answers
// `rects: null` — the caller then OCRs the WHOLE page, as before.
//
// `paintsImage` is the ALLOW-list's input (`ocrSkip.ts`): EVERY image op counts, the grouped
// and repeated ones included, and a tiling pattern counts as one whatever it holds (its
// cells are drawn from an operator list of their own, invisible to the page-level scan).
// Pure: the caller hands in `getOperatorList()`'s arrays and pdf.js's `OPS` table.

/** A rectangle in PDF user space (points, origin bottom-left), `x0 ≤ x1`, `y0 ≤ y1`. */
export interface PdfRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PageImageScan {
  /** Did the page paint (or may it paint) an image? */
  paintsImage: boolean;
  /** Each image's bounding box, or `null` when one could not be bounded. */
  rects: PdfRect[] | null;
}

type Mat = [number, number, number, number, number, number];
const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/** A 6-number matrix, plain or typed array (pdf.js emits both); anything else ⇒ `null`. */
function asMat(v: unknown): Mat | null {
  if (!Array.isArray(v) && !ArrayBuffer.isView(v)) return null;
  const a = Array.from(v as ArrayLike<unknown>);
  return a.length === 6 && a.every((x) => typeof x === "number" && Number.isFinite(x)) ? (a as Mat) : null;
}

/** The unit square [0,1]² mapped through `m`, as an axis-aligned box. */
function unitBox(m: Mat): PdfRect {
  const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]];
  const ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** The image ops whose content is the unit square under the CTM — the ONLY ones bounded. */
const BOUNDED = ["paintImageXObject", "paintImageMaskXObject", "paintInlineImageXObject", "paintSolidColorImageMask"];

/** Every op name pdf.js gives an image: bounded or not, each one makes the page paint one. */
const isImageOpName = (name: string) => /Image/.test(name) && name.startsWith("paint");

const isTilingPattern = (args: unknown) => Array.isArray(args) && args[0] === "TilingPattern";

export function scanPageImages(
  fnArray: readonly number[],
  argsArray: readonly unknown[] | undefined,
  ops: Record<string, number>,
): PageImageScan {
  const id = (name: string) => ops[name];
  const imageOps = new Set(Object.keys(ops).filter(isImageOpName).map(id));
  const bounded = new Set(BOUNDED.map(id).filter((v) => typeof v === "number"));
  const colorN = new Set([id("setFillColorN"), id("setStrokeColorN")]);

  let ctm: Mat = IDENTITY;
  const stack: Mat[] = [];
  const push = () => stack.push(ctm);
  const pop = () => {
    ctm = stack.pop() ?? IDENTITY;
  };
  let inAnnotation = 0;
  let paintsImage = false;
  let unbounded = false;
  const rects: PdfRect[] = [];

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray?.[i] as unknown[] | null | undefined;
    if (fn === ops.save || fn === ops.beginGroup) push();
    else if (fn === ops.restore || fn === ops.endGroup || fn === ops.paintFormXObjectEnd) pop();
    else if (fn === ops.transform) {
      const m = asMat(args);
      if (m) ctm = mul(ctm, m);
      else unbounded = true;
    } else if (fn === ops.paintFormXObjectBegin) {
      push();
      const raw = args?.[0];
      const m = raw == null ? IDENTITY : asMat(raw);
      if (m) ctm = mul(ctm, m);
      else unbounded = true;
    } else if (fn === ops.beginAnnotation) inAnnotation++;
    else if (fn === ops.endAnnotation) inAnnotation = Math.max(0, inAnnotation - 1);
    else if (colorN.has(fn) && isTilingPattern(args)) {
      paintsImage = true;
      unbounded = true;
    } else if (imageOps.has(fn)) {
      paintsImage = true;
      if (!bounded.has(fn) || inAnnotation > 0) unbounded = true;
      else rects.push(unitBox(ctm));
    }
  }
  // Without the arguments no matrix is known: the images are SEEN, never bounded.
  return { paintsImage, rects: unbounded || !argsArray ? null : rects };
}

/** A rectangle as FRACTIONS of the rendered page (0–1, origin TOP-left) — the one space a
 *  raster of any scale can use. */
export interface PageFractionRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * PDF-space rects → page fractions, through the page's scale-1 viewport (`convert` is
 * pdf.js's `viewport.convertToViewportPoint`, which applies the page's rotation and crop
 * box; all four corners go through it, so a rotated page still yields the right box). Clamped to the page; a rect wholly off the page is dropped (nothing of it is
 * rendered, so nothing of it can be read).
 */
export function toPageFractions(
  rects: readonly PdfRect[],
  convert: (x: number, y: number) => number[],
  width: number,
  height: number,
): PageFractionRect[] {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const out: PageFractionRect[] = [];
  for (const r of rects) {
    const pts = [convert(r.x0, r.y0), convert(r.x1, r.y0), convert(r.x0, r.y1), convert(r.x1, r.y1)];
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const f = {
      x0: clamp(Math.min(...xs) / width),
      y0: clamp(Math.min(...ys) / height),
      x1: clamp(Math.max(...xs) / width),
      y1: clamp(Math.max(...ys) / height),
    };
    if (f.x1 > f.x0 && f.y1 > f.y0) out.push(f);
  }
  return out;
}
