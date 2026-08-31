import { describe, expect, it } from "vitest";
import { detectLabelBlocks } from "./labelBlocks";

/** The "column drift" shape: a form whose labels and values
 *  arrive in TWO separate blocks (a two-column table, text layer read column by
 *  column). Neither the inline pass nor the vertical pass sees it — only values
 *  carrying their own shape got through, and anything typed ONLY by its
 *  label (birth date, customer number, bare city) went out in clear. */
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
    // This one is the whole point of the pass: a bare date has no shape to give it away.
    expect(byValue["03/12/1987"]).toBe("DOB");
    expect(byValue["03 20 55 41 87"]).toBe("PHONE");
  });

  it("refuse un appariement DEVINÉ plutôt que de l'approximer", () => {
    // Unequal counts: pairing anyway would type a value with the WRONG
    // category, hence a fake of the wrong kind — worse than a miss.
    expect(detectLabelBlocks("Nom\nPrénom\nVille\n\nRebour\nMarie")).toEqual([]);
    // Below the threshold, a stack of two lines is an ordinary heading.
    expect(detectLabelBlocks("Nom\nPrénom\n\nRebour\nMarie")).toEqual([]);
  });

  it("ne se déclenche pas sur de la prose qui cite les mêmes mots", () => {
    expect(detectLabelBlocks("Le nom\nle prénom\net la ville sont requis pour le dossier")).toEqual([]);
  });

  it("laisse la forme EMPILÉE à la passe verticale", () => {
    // « Nom / REBOUR / Prénom / Marie » is not two blocks: a value line that is
    // itself a label stops the read.
    expect(detectLabelBlocks("Nom\nREBOUR\nPrénom\nMarie\nVille\nLille")).toEqual([]);
  });
});
