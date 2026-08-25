import { describe, expect, it } from "vitest";
import { detectLabelBlocks } from "./labelBlocks";

/** La forme « dérive de colonnes » : le formulaire dont les libellés et les valeurs
 *  arrivent en DEUX blocs séparés (tableau à deux colonnes, couche texte lue colonne par
 *  colonne). Ni la passe inline ni la passe verticale ne la voient — seules les valeurs
 *  portant leur propre forme s'en sortaient, et tout ce qui n'est typé QUE par son
 *  libellé (date de naissance, numéro client, ville nue) partait en clair. */
const FICHE = `FICHE ADHÉRENT
Nom
Prénom
Date de naissance
Téléphone

VILLENEUVE
Anne-Charlotte
03/12/1987
03 20 55 41 87`;

describe("detectLabelBlocks — libellés et valeurs en blocs détachés", () => {
  it("apparie positionnellement et TYPE chaque valeur par son libellé", () => {
    const byValue = Object.fromEntries(detectLabelBlocks(FICHE).map((d) => [d.value, d.category]));
    expect(byValue["VILLENEUVE"]).toBe("NAME");
    expect(byValue["Anne-Charlotte"]).toBe("NAME");
    // Celle-ci est l'intérêt de la passe : une date nue n'a aucune forme qui la trahisse.
    expect(byValue["03/12/1987"]).toBe("DOB");
    expect(byValue["03 20 55 41 87"]).toBe("PHONE");
  });

  it("refuse un appariement DEVINÉ plutôt que de l'approximer", () => {
    // Comptes inégaux : apparier quand même typerait une valeur avec la MAUVAISE
    // catégorie, donc un faux du mauvais genre — pire qu'un manque.
    expect(detectLabelBlocks("Nom\nPrénom\nVille\n\nRebour\nMarie")).toEqual([]);
    // Sous le seuil, une pile de deux lignes est un intitulé ordinaire.
    expect(detectLabelBlocks("Nom\nPrénom\n\nRebour\nMarie")).toEqual([]);
  });

  it("ne se déclenche pas sur de la prose qui cite les mêmes mots", () => {
    expect(detectLabelBlocks("Le nom\nle prénom\net la ville sont requis pour le dossier")).toEqual([]);
  });

  it("laisse la forme EMPILÉE à la passe verticale", () => {
    // « Nom / REBOUR / Prénom / Marie » n'est pas deux blocs : une ligne-valeur qui est
    // elle-même un libellé arrête la lecture.
    expect(detectLabelBlocks("Nom\nREBOUR\nPrénom\nMarie\nVille\nLille")).toEqual([]);
  });
});
