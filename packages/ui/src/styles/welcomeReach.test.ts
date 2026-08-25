import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * L'accueil ne cache JAMAIS son haut — l'invariant, épinglé sur la feuille elle-même.
 *
 * `.welcome` est à la fois le conteneur qui DÉFILE et celui qui CENTRE. Ces deux rôles se
 * contredisent dès que le contenu est plus haut que la boîte : `justify-content: center`
 * pousse alors le début du contenu AU-DESSUS de l'origine du défilement, et `scrollTop` ne
 * descend pas sous zéro. Le bonjour n'était donc pas coupé — il était INATTEIGNABLE
 * (mesuré dans l'app construite : le titre à −34 px pour 700 px de fenêtre).
 *
 * `safe center` est le remède exact : centré tant que ça tient, aligné au DÉBUT dès que ça
 * déborde. Un `center` nu qui reviendrait ici ramènerait le bug en silence — d'où ce test
 * plutôt qu'un commentaire, qu'aucune CI ne lit.
 */
const css = readFileSync(join(__dirname, "..", "styles.css"), "utf8");

const welcome = (() => {
  const at = css.indexOf("\n.welcome {");
  expect(at, "règle `.welcome` absente").toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
})();

describe(".welcome — centré, mais jamais au prix du haut", () => {
  it("défile ET centre : les deux rôles cohabitent grâce à `safe`", () => {
    expect(welcome).toMatch(/overflow-y:\s*auto/);
    expect(welcome).toMatch(/justify-content:\s*safe\s+center/);
  });

  it("aucun `justify-content: center` nu ne subsiste dans cette règle", () => {
    expect(welcome).not.toMatch(/justify-content:\s*center\s*;/);
  });
});
