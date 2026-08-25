import { describe, it, expect } from "vitest";
import { placeSlashPalette, SLASH_MAX, SLASH_MIN_USEFUL } from "./slashPlacement";

/* La palette « / » s'ouvre au-dessus du champ, là où le curseur est. Sur l'écran
   d'ACCUEIL le composeur est centré : la place au-dessus vaut la moitié de la fenêtre
   moins le message de bienvenue. Mesuré au navigateur, la carte de 320px sortait de
   l'écran par le haut sur une fenêtre de 600px — et `.welcome`, qui est un scroller,
   coupait le reste. */

describe("placement de la palette « / »", () => {
  it("reste AU-DESSUS dès qu'il y a la place — c'est là qu'est le curseur", () => {
    // Le cas ordinaire : composeur ancré en bas d'un fil.
    expect(placeSlashPalette(700, 60)).toEqual({ below: false, maxHeight: SLASH_MAX });
  });

  it("se raccourcit plutôt que de déborder", () => {
    const p = placeSlashPalette(240, 100);
    expect(p.below).toBe(false);
    expect(p.maxHeight).toBeLessThan(SLASH_MAX);
    expect(p.maxHeight).toBeLessThanOrEqual(240);
  });

  it("bascule EN DESSOUS quand le dessus n'offre plus une liste utilisable", () => {
    // Accueil, fenêtre courte : peu de place au-dessus, beaucoup en dessous.
    const p = placeSlashPalette(90, 400);
    expect(p.below).toBe(true);
    expect(p.maxHeight).toBeGreaterThanOrEqual(SLASH_MIN_USEFUL);
  });

  it("ne bascule PAS pour gagner quelques pixels — le saut de côté coûte plus", () => {
    const p = placeSlashPalette(300, 320);
    expect(p.below).toBe(false);
  });

  it("n'ouvre jamais une carte de hauteur nulle", () => {
    // Une palette vide se lirait « aucune compétence », ce qui est une autre affirmation,
    // et fausse. Serrée, oui ; muette, non.
    for (const [a, b] of [[0, 0], [10, 5], [30, 20]] as const) {
      const p = placeSlashPalette(a, b);
      expect(p.maxHeight, `${a}/${b}`).toBeGreaterThan(0);
    }
  });

  it("garde une marge avec le bord de la fenêtre", () => {
    expect(placeSlashPalette(400, 0).maxHeight).toBeLessThan(400);
  });
});
