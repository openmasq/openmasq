import { describe, it, expect } from "vitest";
import { redact } from "../../index";

/**
 * ⚠️ REGRESSION — trois formats isolés partaient en clair (benchmark v1.0).
 *
 * Chacun est une BORNE de regex trop étroite, pas une limite de détection : la famille
 * était déjà couverte, un seul dialecte d'écriture tombait à côté.
 */

const kinds = (text: string): string[] => redact(text).matches.map((m) => m.type);
const value = (text: string, type: string): string | undefined =>
  redact(text).matches.find((m) => m.type === type)?.value;

describe("téléphone international écrit avec des parenthèses", () => {
  /**
   * ⚠️ CARACTÉRISATION, pas correctif — et la leçon vaut d'être gardée.
   *
   * Le ticket signalait la forme `+1 (555) 123-4567` comme à moitié redacted. La regex
   * `phone` de `RULES` ne matche effectivement pas les parenthèses, et l'élargir semblait
   * donc être le correctif. Mesuré sur le PIPELINE, c'était un no-op : `phones.ts`
   * `detectPhones` (libphonenumber) couvre déjà toutes ces formes. Benchmarker une règle
   * isolée répond à une question que personne ne se pose ; l'unité qui compte est le
   * pipeline. Ces cas restent ici pour que la couverture ne parte pas par mégarde.
   */
  it.each([
    "+1 (212) 736-5000",
    "+44 (20) 7123 4567",
    "+33 (0)6 12 34 56 78",
  ])("redacted « %s » en entier", (text) => {
    expect(value(text, "phone")).toBe(text);
  });

  it("n'a pas cassé la forme sans parenthèses", () => {
    expect(kinds("+33 6 12 34 56 78")).toContain("phone");
  });

  /**
   * ⚠️ Ce cas vient du ticket et il n'est PAS un bug : `555-123-4567` est un numéro
   * FICTIF (l'indicatif 555 est réservé à la fiction précisément pour n'être celui de
   * personne). `isValidIntlPhone` le refuse, et c'est le validateur qui fait son travail
   * — c'est aussi lui qui rend l'élargissement de la regex sans danger : un match trop
   * gourmand échoue à la validation au lieu de créer un faux positif.
   */
  it("laisse un numéro que libphonenumber juge invalide", () => {
    expect(kinds("+1 (555) 123-4567")).not.toContain("phone");
  });
});

describe("chemin réseau Windows (UNC)", () => {
  it("redacted \\\\srv-fichiers\\compta\\2026", () => {
    const text = "Partage : \\\\srv-fichiers\\compta\\2026";
    expect(value(text, "path")).toBe("\\\\srv-fichiers\\compta\\2026");
  });

  it("n'a pas cassé le chemin à lettre de lecteur", () => {
    expect(kinds("C:\\Users\\julien\\rapport.docx")).toContain("path");
  });
});

describe("e-mail obfusqué", () => {
  /** Écrit ainsi pour échapper à un scraper : l'adresse est donc RÉELLE et son
   *  propriétaire s'attend à être joint dessus. La règle simple n'y voyait pas de `@`. */
  it.each([
    ["Joins augustin [at] kelm.io", "augustin [at] kelm.io"],
    ["Joins augustin (at) kelm.io", "augustin (at) kelm.io"],
    ["Joins augustin [at] kelm [dot] io", "augustin [at] kelm [dot] io"],
  ])("redacted « %s »", (text, expected) => {
    expect(value(text, "email")).toBe(expected);
  });

  it("exige le CROCHET — de la prose ordinaire ne matche pas", () => {
    // Sans cette contrainte, « regarde at home » et « le chat est au chaud » seraient
    // lus comme des adresses. C'est ce qui borne la règle.
    expect(kinds("regarde at home")).not.toContain("email");
    expect(kinds("Le chat est au chaud")).not.toContain("email");
  });

  it("n'a pas cassé l'adresse normale", () => {
    expect(value("Écris à marie@exemple.fr", "email")).toBe("marie@exemple.fr");
  });
});

/**
 * Le ticket annonçait aussi « seul le premier segment du JWT est pris ». Non reproductible :
 * la règle `jwt` prend déjà le jeton entier. Épinglé pour que la prochaine campagne ne
 * re-signale pas un cas qui fonctionne.
 */
describe("JWT — déjà couvert en entier", () => {
  it("redacted les trois segments", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(value(`Bearer : ${jwt}`, "jwt")).toBe(jwt);
  });
});
