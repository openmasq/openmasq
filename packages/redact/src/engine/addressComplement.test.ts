import { describe, it, expect } from "vitest";
import { detectAddresses } from "./addresses";
import { detectAddressComplements, fakeAddressComplement } from "./addressComplement";

/**
 * The address complement — reported 11/08: « Résidence Les Chênes, appartement 12B,
 * 5 allée Verte, 69003 Lyon » came out with the street and city faked but the residence +
 * apartment number in CLEAR. Yet that is what designates the home once the
 * street is replaced.
 */
const complements = (text: string): string[] =>
  detectAddressComplements(text, detectAddresses(text)).map((d) => d.value);

describe("detectAddressComplements — ce qui précède la rue sur la même ligne", () => {
  it("prend la résidence ET le numéro d'appartement", () => {
    expect(complements("Résidence Les Chênes, appartement 12B, 5 allée Verte, 69003 Lyon")).toEqual([
      "Résidence Les Chênes",
      "appartement 12B",
    ]);
  });

  it("prend les abréviations de l'enveloppe", () => {
    expect(complements("Bât. C, appartement 4, 8 rue Lafayette, 75009 Paris")).toEqual([
      "Bât. C",
      "appartement 4",
    ]);
    expect(complements("Chez Morvan, 12 rue de la Paix, 75002 Paris")).toContain("Chez Morvan");
  });

  it("hérite du PAYS de l'adresse qu'il complète — faussé avec elle", () => {
    const text = "Immeuble Lumina, 5 allée Verte, 69003 Lyon";
    const addr = detectAddresses(text).find((d) => d.category === "ADDRESS")!;
    const [comp] = detectAddressComplements(text, detectAddresses(text));
    expect(comp.country).toBe(addr.country);
    expect(comp.category).toBe("ADDRESS");
  });

  /** ADJACENCY is the gate: without an address to complement, the keyword detects nothing. */
  it("ne détecte RIEN sans adresse à côté", () => {
    expect(complements("On visite la résidence Les Chênes demain")).toEqual([]);
    expect(complements("Il faut un appartement plus grand")).toEqual([]);
  });

  it("refuse la PROSE : l'article indéfini n'introduit pas une adresse", () => {
    expect(
      complements("Il cherche un appartement 3 pièces, 12 rue de la Paix, 75002 Paris"),
    ).toEqual([]);
  });

  it("ne franchit pas la ligne — un bloc d'adresse ne récupère pas la ligne d'avant", () => {
    // The previous line can be anything (a header, a signature).
    expect(complements("Envoyé depuis mon appartement bureau\n5 allée Verte, 69003 Lyon")).toEqual(
      [],
    );
  });
});

describe("…et ce qui la SUIT (16/08/2026) — mesuré sur un bail réel", () => {
  /** This file only looked at the BEFORE (« the line written BEFORE the street »). The
   *  lease, on the other hand, writes the complement AFTER: « 2 mail Camille du Gast, 92600,
   *  Asnières, appartement A02 » came out with street/zip/city faked and the apartment
   *  number in clear — word for word the consequence that gave birth to this detector. */
  it("accroche le complément traînant", () => {
    expect(complements("2 mail Camille du Gast, 92600, Asnières, appartement A02"))
      .toContain("appartement A02");
    expect(complements("12 rue des Lilas, 75011 Paris, escalier 3")).toContain("escalier 3");
  });

  it("⚠️ la valeur ne DÉBORDE pas sur la suite de la ligne", () => {
    // The real document has no comma after the code: « appartement A02 Loyer de 650
    // eur ». A greedy value would have swept the rent into the fake.
    expect(complements("2 mail Camille du Gast, 92600, Asnières, appartement A02 Loyer de 650 eur"))
      .toEqual(["appartement A02"]);
  });

  it("⚠️ et une PHRASE qui suit une adresse n'est pas un complément", () => {
    // This is the asymmetry: what follows an address is most often prose. A
    // trailing fragment must be a CODE — a token, carrying a digit.
    expect(complements("5 allée Verte, 69003 Lyon, entrée libre de 9h à 18h")).toEqual([]);
  });
});

describe("le FAUX d'un complément est de même nature que lui (16/08/2026)", () => {
  /** « appartement A02 » received « 27 CHEMIN des Tilleuls »: the category is ADDRESS and
   *  this branch always manufactures a street, so the fake was inventing a SECOND place where
   *  the document designated only one. */
  it("le mot-clé reste, le code change", () => {
    expect(fakeAddressComplement("appartement A02", 7)).toMatch(/^appartement [A-Z]\d\d$/);
    expect(fakeAddressComplement("appartement A02", 7)).not.toBe("appartement A02");
    expect(fakeAddressComplement("escalier 3", 7)).toMatch(/^escalier [1-9]$/);
  });

  it("un zéro de tête ne s'invente pas — « escalier 0 » n'existe pas", () => {
    for (let seed = 0; seed < 40; seed++) {
      expect(fakeAddressComplement("escalier 3", seed)).not.toBe("escalier 0");
    }
    // What is held is the WIDTH of the code, not the zero itself: « porte 03 » stays
    // a two-digit code.
    expect(fakeAddressComplement("porte 03", 7)).toMatch(/^porte \d\d$/);
  });

  it("⚠️ BORNÉ au cas-code : un NOM de résidence garde le chemin d'avant", () => {
    // Letter-by-letter scrambling would make it an unreadable word — this case does not pass here.
    expect(fakeAddressComplement("Résidence Les Chênes", 7)).toBeNull();
    expect(fakeAddressComplement("12 rue des Lilas", 7)).toBeNull();
  });
});

describe("…et un complément qui PASSE À LA LIGNE (persona courtier, 16/08/2026)", () => {
  /** An address block wraps. Measured: « …, 92600, Asnières,\nappartement A02 » —
   *  the complement was going out IN CLEAR for this reason alone, whereas the same sentence on
   *  one line caught it. Same tradeoff as the address shapes' `W` join: what
   *  allows the wrap is that the KEYWORD anchors the fragment. */
  it("un seul retour à la ligne est toléré avant le morceau", () => {
    expect(complements("Le bien est 2 mail Camille du Gast, 92600, Asnières,\nappartement A02, à 385 000 €."))
      .toContain("appartement A02");
  });

  it("⚠️ un SECOND retour ne l'est pas — c'est un autre bloc", () => {
    expect(complements("2 mail Camille du Gast, 92600, Asnières,\n\nappartement A02")).toEqual([]);
  });
});
