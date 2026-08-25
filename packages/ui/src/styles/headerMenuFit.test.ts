import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Le menu ⋯ d'une conversation tient ses libellés sur UNE ligne — l'invariant, épinglé
 * sur la feuille elle-même.
 *
 * `.header-menu` avait une largeur figée à 220 px. Une fois retirés ses 7 px de marge
 * intérieure, la bordure, les 11 px de part et d'autre de l'item, l'icône de 15 px et
 * son écart de 11 px, il ne restait que 156 px de colonne de texte. Or « Supprimer la
 * conversation » en réclame 164 (mesuré à 13 px / Space Grotesk 500) : trois libellés
 * sur quatre repassaient à la ligne, pour huit pixels manquants.
 *
 * Les deux déclarations forment une PAIRE et n'ont de sens qu'ensemble : `max-content`
 * dimensionne le menu sur son plus long libellé, `nowrap` interdit le retour à la ligne.
 * `nowrap` seul déborderait d'une largeur figée ; `max-content` seul laisserait le
 * navigateur casser au plus court. D'où ce test plutôt qu'un commentaire, qu'aucune CI
 * ne lit — et parce qu'une régression de mise en page ne réveille ni le typecheck ni
 * les tests unitaires.
 *
 * ⚠️ Pas de `max-width` ici, volontairement : la peau mobile re-présente ce menu en
 * feuille de bas d'écran pleine largeur (`.app-mobile .header-menu`, styles/mobile/
 * chrome.css) et ne surcharge QUE `width`. Un plafond posé sur la règle de base la
 * pincerait sans que rien ne le signale.
 */
const css = readFileSync(join(__dirname, "..", "styles.css"), "utf8");

/** Le corps d'une règle, depuis son sélecteur en début de ligne jusqu'à l'accolade. */
function rule(selector: string): string {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `règle \`${selector}\` absente`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
}

describe("menu ⋯ de conversation — un libellé, une ligne", () => {
  it("le menu se dimensionne sur son plus long libellé, sans descendre sous 220 px", () => {
    const menu = rule(".header-menu");
    expect(menu, "une largeur figée re-casse les libellés en deux").toMatch(
      /width:\s*max-content/,
    );
    expect(menu).toMatch(/min-width:\s*220px/);
    expect(menu, "un plafond ici pincerait la feuille mobile pleine largeur").not.toMatch(
      /max-width:/,
    );
  });

  it("les actions ne reviennent jamais à la ligne", () => {
    expect(rule(".header-menu-item")).toMatch(/white-space:\s*nowrap/);
  });

  it("la peau mobile garde la main sur la largeur", () => {
    // Si cette surcharge disparaissait, `max-content` reprendrait le dessus et la
    // feuille de bas d'écran cesserait d'être pleine largeur.
    const mobile = readFileSync(join(__dirname, "mobile", "chrome.css"), "utf8");
    const at = mobile.indexOf(".app-mobile .header-menu {");
    expect(at, "surcharge mobile de `.header-menu` absente").toBeGreaterThan(-1);
    expect(mobile.slice(at, mobile.indexOf("}", at))).toMatch(/width:\s*auto/);
  });
});
