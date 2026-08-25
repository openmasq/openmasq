import { describe, it, expect } from "vitest";
import { fixElisions, startsWithVowelSound } from "./elision";
import { unredact } from "./vault";

/**
 * Observed 2026-07-28, under the user's eyes: « C'est noté, je garde en mémoire que tu es
 * à la tête **d'Karl Studio**. » The model wrote correct French around its fake (« Ostrel »,
 * vowel-initial → « d'Ostrel »); restoring a consonant-initial real value left the elision
 * behind.
 *
 * The product's promise is that the user reads THEIR data restored. Mangled French around
 * it makes the restoration look like the machine artefact it is meant to hide.
 */
describe("réparation de l'élision au un-redaction", () => {
  it("répare le cas signalé", () => {
    expect(unredact("tu es à la tête d'Ostrel.", { Ostrel: "Karl Studio" })).toBe(
      "tu es à la tête de Karl Studio.",
    );
  });

  it("répare aussi le sens INVERSE : consonne → voyelle", () => {
    // Faux à consonne (« de Kelby »), réel à voyelle → « d'Ambrell ».
    expect(unredact("une facture de Kelby hier", { Kelby: "Ambrell" })).toBe(
      "une facture d'Ambrell hier",
    );
  });

  it("couvre les autres élidées non ambiguës", () => {
    expect(fixElisions("qu'Karl arrive", ["Karl"])).toBe("que Karl arrive");
    expect(fixElisions("n'Karl ni personne", ["Karl"])).toBe("ne Karl ni personne");
  });

  it("garde la casse de l'article", () => {
    expect(fixElisions("D'Karl Studio vient la réponse", ["Karl Studio"])).toBe(
      "De Karl Studio vient la réponse",
    );
  });

  it("ne touche PAS `l'` — le genre est inconnu, et deviner est pire", () => {
    // « le Karl » / « la Karl » : rien ne permet de choisir. On laisse.
    expect(fixElisions("l'Karl Studio", ["Karl Studio"])).toBe("l'Karl Studio");
  });

  it("n'agit QUE devant la valeur restaurée", () => {
    // Le reste de la phrase est du français que personne ne nous a demandé de corriger.
    expect(fixElisions("d'accord, parlons d'Karl", ["Karl"])).toBe("d'accord, parlons de Karl");
  });

  it("ne se déclenche pas quand la valeur est déjà bien accordée", () => {
    expect(fixElisions("de Karl Studio", ["Karl Studio"])).toBe("de Karl Studio");
    expect(fixElisions("d'Ambrell", ["Ambrell"])).toBe("d'Ambrell");
  });

  it("traite le h comme une consonne — « de H… » passe toujours", () => {
    expect(startsWithVowelSound("Hachette")).toBe(false);
    expect(fixElisions("de Hachette", ["Hachette"])).toBe("de Hachette");
  });

  it("les valeurs longues passent d'abord — un fragment ne réécrit pas dans une plus longue", () => {
    expect(fixElisions("d'Karl Studio Paris", ["Karl", "Karl Studio Paris"])).toBe(
      "de Karl Studio Paris",
    );
  });
});

describe("l'EMPHASE MARKDOWN s'intercale entre l'article et la valeur (16/08/2026)", () => {
  /** Le modèle met les noms en gras : c'est le cas COURANT d'une réponse, pas un cas
   *  limite. Ancrée sur la valeur nue, la réparation ne s'appliquait donc jamais là où
   *  l'utilisateur lit — la même phrase sans gras était réparée. */
  it("répare à travers `**`, `*` et `__`", () => {
    expect(fixElisions("à la tête d'**Karl Studio**", ["Karl Studio"]))
      .toBe("à la tête de **Karl Studio**");
    expect(fixElisions("signé d'*CAMILLE CROS*", ["CAMILLE CROS"]))
      .toBe("signé de *CAMILLE CROS*");
    expect(fixElisions("le compte de __Ambrell__", ["Ambrell"]))
      .toBe("le compte d'__Ambrell__");
  });

  it("les marqueurs sont ré-émis VERBATIM — on touche l'article, jamais le balisage", () => {
    // Le marqueur fermant est hors du motif : rien ne doit le déplacer ni le doubler.
    expect(fixElisions("le dossier de **Ambrell**", ["Ambrell"]))
      .toBe("le dossier d'**Ambrell**");
  });
});
