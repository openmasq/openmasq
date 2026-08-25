// @vitest-environment jsdom
// (`tooltipLabelOf` reads real attributes off a real element — the repo's per-file opt-in.)
import { describe, it, expect } from "vitest";
import { placeTooltip, tooltipLabelOf, type Rect } from "./tooltipPlacement";

const VIEWPORT = { width: 1280, height: 800 };
const BUBBLE = { width: 200, height: 30 };
const trigger = (over: Partial<Rect> = {}): Rect => ({
  top: 300,
  left: 600,
  width: 30,
  height: 30,
  ...over,
});

// Every case here is one the eye cannot catch in a screenshot: a bubble half off-screen
// still renders, and the trigger it belongs to still looks fine.

describe("placeTooltip", () => {
  it("centres under the trigger when there is room", () => {
    const p = placeTooltip(trigger(), BUBBLE, VIEWPORT);
    expect(p.above).toBe(false);
    expect(p.top).toBe(338); // 300 + 30 + 8 gap
    expect(p.left).toBe(515); // 600 + 15 − 100
  });

  it("flips ABOVE a trigger at the bottom edge (the composer's action row)", () => {
    const p = placeTooltip(trigger({ top: 760 }), BUBBLE, VIEWPORT);
    expect(p.above).toBe(true);
    expect(p.top).toBe(722); // 760 − 8 gap − 30 height
  });

  it("does NOT flip on a tie — a bubble that jumps on resize is worse", () => {
    // Equal room above and below: `above > below` is false, so it stays put.
    const t = trigger({ top: 385, height: 30 });
    expect(placeTooltip(t, { width: 200, height: 400 }, VIEWPORT).above).toBe(false);
  });

  it("clamps at the RIGHT edge (a rail button, a row's ⋯)", () => {
    const p = placeTooltip(trigger({ left: 1260 }), BUBBLE, VIEWPORT);
    expect(p.left).toBe(1072); // 1280 − 200 − 8 margin
    expect(p.left + BUBBLE.width).toBeLessThanOrEqual(VIEWPORT.width);
  });

  it("clamps at the LEFT edge (the collapsed rail)", () => {
    expect(placeTooltip(trigger({ left: 4 }), BUBBLE, VIEWPORT).left).toBe(8);
  });

  it("pins to the left when the bubble is wider than the viewport", () => {
    // The clamp order matters: min() first would push it off the LEFT edge instead.
    const p = placeTooltip(trigger(), { width: 2000, height: 30 }, VIEWPORT);
    expect(p.left).toBe(8);
  });

  it("handles both edges at once — bottom-right corner, wide bubble", () => {
    const p = placeTooltip(trigger({ top: 770, left: 1240 }), { width: 320, height: 60 }, VIEWPORT);
    expect(p.above).toBe(true);
    expect(p.left).toBe(952);
    expect(p.top).toBeGreaterThanOrEqual(0);
  });
});

describe("tooltipLabelOf", () => {
  const el = (attrs: Record<string, string>) => {
    const node = document.createElement("button");
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };

  it("reads the title", () => {
    expect(tooltipLabelOf(el({ title: "Envoyer" }))).toBe("Envoyer");
  });

  it("trims it", () => {
    expect(tooltipLabelOf(el({ title: "  Envoyer  " }))).toBe("Envoyer");
  });

  it("stays silent on an empty or whitespace title — several call sites mean 'no tip'", () => {
    expect(tooltipLabelOf(el({ title: "" }))).toBeNull();
    expect(tooltipLabelOf(el({ title: "   " }))).toBeNull();
  });

  it("stays silent with no title at all", () => {
    expect(tooltipLabelOf(el({}))).toBeNull();
  });

  it("honours the explicit opt-out", () => {
    expect(tooltipLabelOf(el({ title: "Envoyer", "data-tip": "off" }))).toBeNull();
  });
});

describe("placeTooltip — le navigateur agent est un TROU, pas un calque", () => {
  const VP = { width: 1400, height: 900 };
  const BUBBLE = { width: 200, height: 30 };
  // La fenêtre native est épinglée sur `.browser-viewport` : la moitié droite, sous la
  // barre d'outils du panneau. Aucun z-index ne passe par-dessus.
  const BROWSER = { top: 120, left: 700, width: 700, height: 700 };

  it("bascule AU-DESSUS un bouton dont la bulle tomberait sur la fenêtre native", () => {
    // Un bouton de la barre du navigateur (retour, recharger, ✕) : de la place en bas au
    // sens du viewport, mais cette place est occupée par la fenêtre native.
    const trigger = { top: 80, left: 900, width: 30, height: 30 };
    const free = placeTooltip(trigger, BUBBLE, VP);
    expect(free.above, "sans obstacle la bulle va dessous").toBe(false);

    const blocked = placeTooltip(trigger, BUBBLE, VP, BROWSER);
    expect(blocked.above, "avec la fenêtre native elle passe au-dessus").toBe(true);
    expect(blocked.top + BUBBLE.height).toBeLessThanOrEqual(BROWSER.top);
  });

  it("ne bascule pas quand la bulle tombe à CÔTÉ de la fenêtre (moitié gauche)", () => {
    // Le chat occupe la gauche : rien à éviter, la bulle garde sa place naturelle.
    const trigger = { top: 300, left: 200, width: 30, height: 30 };
    expect(placeTooltip(trigger, BUBBLE, VP, BROWSER).above).toBe(false);
  });

  it("garde le choix d'origine quand les DEUX côtés sont couverts", () => {
    // Un déclencheur au milieu de la fenêtre native : rien à gagner à basculer, et une
    // bascule inutile ferait sauter la bulle.
    const trigger = { top: 400, left: 900, width: 30, height: 30 };
    const obstacle = { top: 0, left: 700, width: 700, height: 900 };
    expect(placeTooltip(trigger, BUBBLE, VP, obstacle).above).toBe(
      placeTooltip(trigger, BUBBLE, VP).above,
    );
  });

  it("un obstacle absent ou nul ne change RIEN — le placement d'avant est intact", () => {
    const trigger = { top: 80, left: 900, width: 30, height: 30 };
    const base = placeTooltip(trigger, BUBBLE, VP);
    expect(placeTooltip(trigger, BUBBLE, VP, null)).toEqual(base);
    expect(placeTooltip(trigger, BUBBLE, VP, undefined)).toEqual(base);
  });
});
