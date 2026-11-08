import { describe, expect, it } from "vitest";
import { HIGHLIGHT_ALPHA, paintValueBox } from "./paintBox";
import { paintCoversReplacements } from "./pdfMatch";

/**
 * `highlight` is a REVIEW paint: the real value stays readable under a tone wash. Two
 * properties: it really lets the text through (translucent, no fake drawn over it), and a
 * page painted that way can NEVER pass the ship gate — it covers nothing.
 */

/** Records each `fill` with the alpha/composite in force at that moment. */
function stubCtx() {
  const fills: { alpha: number; op: string }[] = [];
  const texts: string[] = [];
  const stack: { alpha: number; op: string }[] = [];
  const ctx = {
    fillStyle: "",
    textBaseline: "",
    font: "10px x",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    measureText: (s: string) => ({ width: s.length * 5 }),
    beginPath: () => {},
    roundRect: () => {},
    rect: () => {},
    clip: () => {},
    fill: () => fills.push({ alpha: ctx.globalAlpha, op: ctx.globalCompositeOperation }),
    fillText: (s: string) => texts.push(s),
    save: () => stack.push({ alpha: ctx.globalAlpha, op: ctx.globalCompositeOperation }),
    restore: () => {
      const s = stack.pop();
      if (s) {
        ctx.globalAlpha = s.alpha;
        ctx.globalCompositeOperation = s.op;
      }
    },
  };
  return { ctx, fills, texts };
}

const box = { left: 10, top: 10, w: 40, h: 12, fake: "[PERSON1]", tone: "sky" };

describe("paintValueBox — mode highlight", () => {
  it("un surlignage est translucide, multiplié, et ne peint aucun libellé par-dessus", () => {
    const { ctx, fills, texts } = stubCtx();
    paintValueBox(ctx as never, box, { mode: "highlight" });
    expect(fills).toEqual([{ alpha: HIGHLIGHT_ALPHA, op: "multiply" }]);
    expect(texts).toEqual([]);
    // The state is restored: a later cover paint on the same context stays opaque.
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.globalCompositeOperation).toBe("source-over");
  });

  it("le mode par défaut reste couvrant : fond opaque + libellé", () => {
    const { ctx, fills, texts } = stubCtx();
    paintValueBox(ctx as never, box);
    expect(fills).toEqual([{ alpha: 1, op: "source-over" }]);
    expect(texts.length).toBe(1);
  });
});

describe("paintCoversReplacements — une page surlignée ne part jamais", () => {
  const reps = [{ real: "Vaudel", fake: "Grandjean", tone: "sky" }];
  const page = (paintMode?: string) => ({
    boxes: [{ real: "Vaudel", revealed: false }],
    covered: new Set(["Vaudel"]),
    paintMode,
  });

  it("refuse une page peinte en highlight, même si chaque valeur y a sa boîte", () => {
    expect(paintCoversReplacements([page("highlight")], reps)).toBe(false);
    expect(paintCoversReplacements([page("cover"), page("highlight")], reps)).toBe(false);
  });

  it("refuse un mode inconnu (liste blanche, pas liste noire)", () => {
    expect(paintCoversReplacements([page("wash")], reps)).toBe(false);
  });

  it("accepte la même page peinte en cover (ou sans mode, appelant historique)", () => {
    expect(paintCoversReplacements([page("cover")], reps)).toBe(true);
    expect(paintCoversReplacements([page()], reps)).toBe(true);
  });
});
