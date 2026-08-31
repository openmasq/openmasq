import { describe, it, expect } from "vitest";
import { placeSlashPalette, SLASH_MAX, SLASH_MIN_USEFUL } from "./slashPlacement";

/* The « / » palette opens above the field, where the cursor is. On the HOME
   screen the composer is centered: the space above equals half the window
   minus the welcome message. Measured in the browser, the 320px card went off
   the top of the screen on a 600px window — and `.welcome`, which is a scroller,
   cut off the rest. */

describe("placement de la palette « / »", () => {
  it("reste AU-DESSUS dès qu'il y a la place — c'est là qu'est le curseur", () => {
    // The ordinary case: composer anchored at the bottom of a thread.
    expect(placeSlashPalette(700, 60)).toEqual({ below: false, maxHeight: SLASH_MAX });
  });

  it("se raccourcit plutôt que de déborder", () => {
    const p = placeSlashPalette(240, 100);
    expect(p.below).toBe(false);
    expect(p.maxHeight).toBeLessThan(SLASH_MAX);
    expect(p.maxHeight).toBeLessThanOrEqual(240);
  });

  it("bascule EN DESSOUS quand le dessus n'offre plus une liste utilisable", () => {
    // Home, short window: little room above, plenty below.
    const p = placeSlashPalette(90, 400);
    expect(p.below).toBe(true);
    expect(p.maxHeight).toBeGreaterThanOrEqual(SLASH_MIN_USEFUL);
  });

  it("ne bascule PAS pour gagner quelques pixels — le saut de côté coûte plus", () => {
    const p = placeSlashPalette(300, 320);
    expect(p.below).toBe(false);
  });

  it("n'ouvre jamais une carte de hauteur nulle", () => {
    // An empty palette would read as « aucune compétence », which is a different claim,
    // and a false one. Tight, yes; silent, no.
    for (const [a, b] of [[0, 0], [10, 5], [30, 20]] as const) {
      const p = placeSlashPalette(a, b);
      expect(p.maxHeight, `${a}/${b}`).toBeGreaterThan(0);
    }
  });

  it("garde une marge avec le bord de la fenêtre", () => {
    expect(placeSlashPalette(400, 0).maxHeight).toBeLessThan(400);
  });
});
