import { describe, expect, it } from "vitest";
import {
  PAD_Y_GLYPH,
  PAD_Y_LINE,
  cornerRadius,
  fitFontPx,
  inflate,
  padFor,
  paintValueBox,
  boxLabel,
  TOKEN_DOTS,
} from "./paintBox";
import type { RedactBox } from "./pdfMatch";

/**
 * The two things a redaction box owes the reader, and one it owes the PRODUCT:
 *   • it must be READABLE — the fake replacing a value is routinely longer than it
 *     ("Vaudel" → "Grandjean"), and both painters used to clip it mid-word, which a reader
 *     cannot tell apart from a real truncated value;
 *   • it must look like a highlight over the word, not a bar clipping its ascenders;
 *   • and it must NEVER expose a pixel of the real value it covers — which is what makes
 *     the padding one-directional and caps the corner radius.
 */

/** A 2D-context stub that records what was painted and measures text ~linearly. */
function stubCtx() {
  const calls: { op: string; args: unknown[] }[] = [];
  let fontPx = 10;
  const ctx = {
    fillStyle: "",
    textBaseline: "",
    get font() {
      return `${fontPx}px x`;
    },
    set font(v: string) {
      fontPx = parseFloat(v) || 10;
    },
    // ~0.5em per character — enough to make "does it fit" meaningful.
    measureText: (s: string) => ({ width: s.length * fontPx * 0.5 }),
    beginPath: () => calls.push({ op: "beginPath", args: [] }),
    roundRect: (...a: unknown[]) => calls.push({ op: "roundRect", args: a }),
    rect: (...a: unknown[]) => calls.push({ op: "rect", args: a }),
    fill: () => calls.push({ op: "fill", args: [] }),
    fillRect: (...a: unknown[]) => calls.push({ op: "fillRect", args: a }),
    fillText: (...a: unknown[]) => calls.push({ op: "fillText", args: a }),
    clip: () => calls.push({ op: "clip", args: [] }),
    save: () => calls.push({ op: "save", args: [] }),
    restore: () => calls.push({ op: "restore", args: [] }),
    get fontPx() {
      return fontPx;
    },
  };
  return { ctx, calls };
}

const box = (over: Partial<RedactBox> = {}): RedactBox => ({
  left: 100,
  top: 50,
  w: 40,
  h: 12,
  original: "Vaudel",
  real: "Vaudel",
  fake: "Grandjean",
  tone: "sky",
  revealed: false,
  ...over,
});

describe("inflate — a highlight, never a shrink", () => {
  it("grows on all four sides, so the fill still covers every real glyph", () => {
    const r = inflate({ left: 100, top: 50, w: 40, h: 12 });
    expect(r.left).toBeLessThan(100);
    expect(r.top).toBeLessThan(50);
    expect(r.left + r.w).toBeGreaterThan(140);
    expect(r.top + r.h).toBeGreaterThan(62);
  });

  it("keeps a floor on a tiny box — 8-pt scan text still gets a real stroke", () => {
    const r = inflate({ left: 0, top: 0, w: 3, h: 2 });
    expect(r.h - 2).toBeGreaterThanOrEqual(2); // ≥ 1px added top AND bottom
  });

  it("the corner radius can only ever round off PADDING, never the covered box", () => {
    for (const h of [2, 8, 12, 40, 120]) {
      const tight = { left: 0, top: 0, w: 60, h };
      const r = inflate(tight);
      const padY = r.top + r.h - (tight.top + tight.h);
      const padX = r.left + r.w - (tight.left + tight.w);
      // A radius bigger than the padding would bite into the original glyph rect and
      // expose the real value at the corners.
      expect(cornerRadius(tight)).toBeLessThanOrEqual(Math.min(padX, padY) + 0.001);
    }
  });
});

describe("fitFontPx — the fake is fitted, not cut", () => {
  it("keeps the ideal size when the fake already fits", () => {
    const { ctx } = stubCtx();
    expect(fitFontPx(ctx, "ok", 200, 12)).toBe(12);
  });

  it("shrinks a LONGER fake until it fits the box it inherited from a short real", () => {
    const { ctx } = stubCtx();
    const px = fitFontPx(ctx, "Grandjean", 40, 12);
    expect(px).toBeLessThan(12);
    ctx.font = `${px}px x`;
    expect(ctx.measureText("Grandjean").width).toBeLessThanOrEqual(40);
  });

  it("stops at a readable floor rather than shrinking to nothing", () => {
    const { ctx } = stubCtx();
    expect(fitFontPx(ctx, "un nom vraiment très long", 4, 12)).toBeGreaterThanOrEqual(7);
  });
});

describe("paintValueBox", () => {
  it("fills BEFORE drawing the fake — the real glyphs are covered, never showing through", () => {
    const { ctx, calls } = stubCtx();
    paintValueBox(ctx as never, box());
    const fill = calls.findIndex((c) => c.op === "fill");
    const text = calls.findIndex((c) => c.op === "fillText");
    expect(fill).toBeGreaterThanOrEqual(0);
    expect(text).toBeGreaterThan(fill);
  });

  it("paints the INFLATED rect, not the tight one", () => {
    const { ctx, calls } = stubCtx();
    paintValueBox(ctx as never, box());
    const [left, top, w, h] = calls.find((c) => c.op === "roundRect")!.args as number[];
    expect(left).toBeLessThan(100);
    expect(top).toBeLessThan(50);
    expect(w).toBeGreaterThan(40);
    expect(h).toBeGreaterThan(12);
  });

  it("falls back to a SQUARE box when roundRect is absent — a missing fill would leak", () => {
    const { ctx, calls } = stubCtx();
    delete (ctx as { roundRect?: unknown }).roundRect;
    paintValueBox(ctx as never, box());
    expect(calls.some((c) => c.op === "rect")).toBe(true);
    expect(calls.some((c) => c.op === "fill")).toBe(true);
  });

  it("a segment with NO fake still gets its fill (a split value's later segments)", () => {
    const { ctx, calls } = stubCtx();
    paintValueBox(ctx as never, box({ fake: "" }));
    expect(calls.some((c) => c.op === "fill")).toBe(true);
    expect(calls.some((c) => c.op === "fillText")).toBe(false);
  });

  it("sits the fake on the caller's BASELINE when there is one (the PDF text layer)", () => {
    const { ctx, calls } = stubCtx();
    paintValueBox(ctx as never, box(), { baseline: 61 });
    const [, , y] = calls.find((c) => c.op === "fillText")!.args as [string, number, number];
    expect(y).toBe(61);
  });
});

describe("vertical padding — a text-LAYER box must not reach into the next line", () => {
  /** The text-layer geometry, as `revealPatch.ts` builds it: a LINE box, not a glyph box. */
  const lineBox = (fontPx: number, baseline: number) => ({
    left: 0,
    top: baseline - fontPx * 0.85,
    w: 50,
    h: fontPx * 1.12,
  });

  it("leaves consecutive lines disjoint at ordinary leading (1.15× and above)", () => {
    const fh = 12;
    for (const leading of [1.15, 1.2, 1.4, 1.6]) {
      const a = inflate(lineBox(fh, 0), PAD_Y_LINE);
      const b = inflate(lineBox(fh, fh * leading), PAD_Y_LINE);
      expect(a.top + a.h, `leading ${leading}×`).toBeLessThanOrEqual(b.top);
    }
  });

  it("the GLYPH padding would collide there — which is why the two differ", () => {
    const fh = 12;
    const a = inflate(lineBox(fh, 0), PAD_Y_GLYPH);
    const b = inflate(lineBox(fh, fh * 1.2), PAD_Y_GLYPH);
    expect(a.top + a.h).toBeGreaterThan(b.top);
  });

  it("still GROWS horizontally, and never SHRINKS the box in either axis (rule: cover the glyphs)", () => {
    const tight = lineBox(12, 0);
    const r = inflate(tight, PAD_Y_LINE);
    expect(r.left).toBeLessThan(tight.left);
    expect(r.w).toBeGreaterThan(tight.w);
    expect(r.top).toBeLessThanOrEqual(tight.top);
    expect(r.h).toBeGreaterThanOrEqual(tight.h);
  });

  it("a zero vertical fraction means ZERO growth — the MIN_PAD floor must not resurrect it", () => {
    const tight = lineBox(12, 0);
    expect(padFor(tight, PAD_Y_LINE).y).toBe(0);
    expect(padFor(tight, PAD_Y_GLYPH).y).toBeGreaterThan(0);
  });
});

describe("boxLabel — un jeton d'affichage se peint « ••• »", () => {
  it("remplace un jeton, quelle que soit sa longueur ou son numéro", () => {
    for (const t of ["[PERSON1]", "[SECRET]", "[COMPANY_ID2]", "[IBAN]", "[NUM12]"])
      expect(boxLabel(t)).toBe(TOKEN_DOTS);
  });

  it("laisse un PSEUDONYME intact — il fait la largeur de ce qu'il remplace", () => {
    // That's the whole point of the default mode: a fake name reads as a name.
    for (const f of ["Grandjean", "Karl Studio", "FR76 3000 6000 0112 3456 7890 189"])
      expect(boxLabel(f)).toBe(f);
  });

  it("ne confond pas une vraie valeur entre crochets avec un jeton", () => {
    // A document may contain "[NOTE]" or "[Réf. 12]" in clear; only the tokens
    // that `CATEGORY_TOKEN` produces (UPPERCASE + digits + "_") become dots.
    for (const f of ["[Réf. 12]", "[note]", "[a b]", "[]", "[Person1]"])
      expect(boxLabel(f)).toBe(f);
  });
});

describe("paintValueBox — le jeton peint tient dans la boîte", () => {
  /** The font actually used for the last `fillText`. */
  const paintedWith = (fake: string, w: number) => {
    const { ctx, calls } = stubCtx();
    paintValueBox(ctx as never, box({ fake, w }));
    const txt = calls.find((c) => c.op === "fillText");
    return { text: txt?.args[0] as string, px: ctx.fontPx };
  };

  it("un jeton long sur une boîte étroite ne descend plus au plancher de police", () => {
    // The reported case: the box is sized on the REAL value ("Vaudel"), the token is
    // unrelated to its width. Before, it shrank down to MIN_FONT and then got
    // clipped — "[COMP…", which the reader can't tell apart from a truncated value.
    const token = paintedWith("[COMPANY_ID2]", 24);
    expect(token.text).toBe(TOKEN_DOTS);
    expect(token.px, "les points doivent rester lisibles").toBeGreaterThan(7);
  });

  it("les points se peignent PLUS GRAND que le jeton qu'ils remplacent", () => {
    const { ctx, calls } = stubCtx();
    paintValueBox(ctx as never, box({ fake: "[COMPANY_ID2]", w: 24 }));
    const dotsPx = ctx.fontPx;
    const { ctx: ctx2 } = stubCtx();
    // Same string, but not recognised as a token → painted as-is.
    paintValueBox(ctx2 as never, box({ fake: "COMPANY_ID2", w: 24 }));
    expect(dotsPx).toBeGreaterThan(ctx2.fontPx);
    expect(calls.some((c) => c.op === "fill"), "le fond couvre toujours les vrais glyphes").toBe(true);
  });
});
