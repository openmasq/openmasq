import { describe, it, expect } from "vitest";
import { readStylesheet } from "./readStylesheet";

/**
 * **Survoler une conversation ne doit RIEN redimensionner.** La ligne échange deux éléments
 * de son bord droit — l'heure s'efface, le menu ⋯ paraît — et l'échange s'est déjà fait deux
 * fois au prix d'un saut :
 *
 *  • en HAUTEUR : un `IconButton` mesure 30 px là où la ligne au repos en fait 20, donc posé
 *    dans le flux il poussait la ligne de +10 px sous le curseur ;
 *  • en LARGEUR : `display: none` sur l'heure rendait ses 46 px au titre, qui s'élargissait.
 *
 * Aucun des deux ne se voit d'un typecheck ni d'un rendu jsdom (rien n'y a de dimension), et
 * le second est revenu par une redéclaration restée en fin de feuille, plus bas dans la
 * cascade que la règle correcte. D'où ce test sur la feuille RÉSOLUE, qui lit ce qui gagne.
 */
const CSS = readStylesheet();

/** Les blocs dont le sélecteur mentionne `.conv-time` sous un `:hover`/`:focus-within`. */
function hoverTimeBlocks(): string[] {
  const out: string[] = [];
  const re = /([^{}]*\.conv-time[^{}]*)\{([^}]*)\}/g;
  for (let m = re.exec(CSS); m; m = re.exec(CSS)) {
    if (/:hover|:focus-within/.test(m[1])) out.push(m[2]);
  }
  return out;
}

describe("ligne de conversation — le survol ne change aucune dimension", () => {
  it("efface l'heure sans rendre sa place au titre", () => {
    const blocks = hoverTimeBlocks();
    expect(blocks.length).toBeGreaterThan(0);
    for (const body of blocks) {
      expect(body).toMatch(/visibility:\s*hidden/);
      // La redéclaration qui a fait revenir le bug.
      expect(body).not.toMatch(/display:\s*none/);
    }
  });

  it("sort le menu ⋯ du flux, pour qu'il ne puisse pas grandir la ligne", () => {
    const decl = /\.conv-actions\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "";
    expect(decl).toMatch(/position:\s*absolute/);
    expect(/\.conv-item\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "").toMatch(/position:\s*relative/);
  });
});
