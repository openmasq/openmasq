import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Le débordement HORIZONTAL de l'écran d'accueil, épinglé — parce qu'une régression CSS
 * ne se voit ni au typecheck ni au rendu d'un composant.
 *
 * Ce qui s'est passé : les cartes d'amorce coupaient leur invite à UNE ligne avec
 * `white-space: nowrap`. Une ligne insécable donne à l'élément de grille une taille
 * minimale automatique égale à sa PHRASE ENTIÈRE : la colonne `1fr` refuse alors de
 * rétrécir, et c'est tout l'accueil qui défile latéralement (mesuré dans l'app construite :
 * 911 px de contenu dans une colonne de 560).
 *
 * Deux moitiés d'une même règle, donc deux vérifications : le plafond se met sur la
 * HAUTEUR (un nombre de lignes), et chaque conteneur de la chaîne pose `min-width: 0`.
 */
const css = readFileSync(join(__dirname, "starters.css"), "utf8");

/** Le corps d'une règle, par son sélecteur exact. */
function block(selector: string): string {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `sélecteur absent : ${selector}`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
}

describe("starters.css — l'accueil ne défile jamais latéralement", () => {
  it("l'invite est plafonnée en LIGNES, jamais rendue insécable", () => {
    const prompt = block(".om-starter-prompt");
    expect(prompt).not.toMatch(/white-space:\s*nowrap/);
    expect(prompt).toMatch(/-webkit-line-clamp:\s*\d/);
    expect(prompt).toMatch(/overflow:\s*hidden/);
  });

  it("chaque maillon de la chaîne pose `min-width: 0`", () => {
    // La carte est l'élément de GRILLE : sans ce zéro, sa largeur minimale reste celle de
    // son contenu, quoi que la colonne demande.
    for (const sel of [".om-starter", ".om-starter-prompt"]) {
      expect(block(sel), sel).toMatch(/min-width:\s*0/);
    }
  });

  it("la carte tient sur UNE ligne — c'est ce qui borne la hauteur du bloc", () => {
    // Empilée, la carte faisait 78 px et le bloc 538 : l'accueil débordait par le bas.
    expect(block(".om-starter")).toMatch(/align-items:\s*center/);
    expect(block(".om-starter")).not.toMatch(/flex-direction:\s*column/);
    expect(block(".om-starter-prompt")).toMatch(/line-clamp:\s*1/);
  });

  it("la rangée de puces passe à la ligne", () => {
    expect(block(".om-starter-chips")).toMatch(/flex-wrap:\s*wrap/);
  });

  // L'autre moitié du même piège, sur l'axe du CENTRAGE. `.welcome` centre ses enfants,
  // donc la largeur du bloc d'amorces est celle de son plus large enfant : une rangée de
  // puces plus longue que la grille élargissait le bloc, la grille (bornée à 560) se
  // collait à gauche et « Ne plus proposer » (aligné à droite) partait au-delà des cartes.
  // Une seule largeur pour tous les enfants — mesuré dans l'app construite : bloc, grille
  // et rangée de puces partagent le même centre que le bonjour et le composeur.
  it("le bloc d'amorces est borné à la largeur des cartes", () => {
    const wrap = block(".om-starters-wrap");
    const grid = block(".om-starters");
    const cap = /max-width:\s*(\d+)px/;
    expect(wrap).toMatch(cap);
    expect(cap.exec(wrap)![1]).toBe(cap.exec(grid)![1]);
  });
});
