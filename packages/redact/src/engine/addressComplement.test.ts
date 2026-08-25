import { describe, it, expect } from "vitest";
import { detectAddresses } from "./addresses";
import { detectAddressComplements, fakeAddressComplement } from "./addressComplement";

/**
 * Le complément d'adresse — remonté le 11/08 : « Résidence Les Chênes, appartement 12B,
 * 5 allée Verte, 69003 Lyon » sortait avec la rue et la ville faussées et la résidence +
 * le numéro d'appartement en CLAIR. C'est pourtant ce qui désigne le foyer une fois la
 * rue remplacée.
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

  /** L'ADJACENCE est la porte : sans adresse à compléter, le mot-clé ne détecte rien. */
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
    // La ligne précédente peut être n'importe quoi (un en-tête, une signature).
    expect(complements("Envoyé depuis mon appartement bureau\n5 allée Verte, 69003 Lyon")).toEqual(
      [],
    );
  });
});

describe("…et ce qui la SUIT (16/08/2026) — mesuré sur un bail réel", () => {
  /** Ce fichier ne regardait que l'AVANT (« la ligne qu'on écrit AVANT la rue »). Le bail,
   *  lui, écrit le complément APRÈS : « 2 mail Camille du Gast, 92600, Asnières,
   *  appartement A02 » sortait rue/CP/ville faussés et le numéro d'appartement en clair —
   *  mot pour mot la conséquence qui a fait naître ce détecteur. */
  it("accroche le complément traînant", () => {
    expect(complements("2 mail Camille du Gast, 92600, Asnières, appartement A02"))
      .toContain("appartement A02");
    expect(complements("12 rue des Lilas, 75011 Paris, escalier 3")).toContain("escalier 3");
  });

  it("⚠️ la valeur ne DÉBORDE pas sur la suite de la ligne", () => {
    // Le document réel n'a pas de virgule après le code : « appartement A02 Loyer de 650
    // eur ». Une valeur gloutonne aurait emporté le loyer dans le faux.
    expect(complements("2 mail Camille du Gast, 92600, Asnières, appartement A02 Loyer de 650 eur"))
      .toEqual(["appartement A02"]);
  });

  it("⚠️ et une PHRASE qui suit une adresse n'est pas un complément", () => {
    // C'est l'asymétrie : ce qui suit une adresse est le plus souvent de la prose. Un
    // morceau traînant doit être un CODE — un jeton, portant un chiffre.
    expect(complements("5 allée Verte, 69003 Lyon, entrée libre de 9h à 18h")).toEqual([]);
  });
});

describe("le FAUX d'un complément est de même nature que lui (16/08/2026)", () => {
  /** « appartement A02 » recevait « 27 CHEMIN des Tilleuls » : la catégorie est ADDRESS et
   *  cette branche fabrique toujours une rue, donc le faux inventait un SECOND lieu là où
   *  le document en désignait un seul. */
  it("le mot-clé reste, le code change", () => {
    expect(fakeAddressComplement("appartement A02", 7)).toMatch(/^appartement [A-Z]\d\d$/);
    expect(fakeAddressComplement("appartement A02", 7)).not.toBe("appartement A02");
    expect(fakeAddressComplement("escalier 3", 7)).toMatch(/^escalier [1-9]$/);
  });

  it("un zéro de tête ne s'invente pas — « escalier 0 » n'existe pas", () => {
    for (let seed = 0; seed < 40; seed++) {
      expect(fakeAddressComplement("escalier 3", seed)).not.toBe("escalier 0");
    }
    // Ce qui est tenu, c'est la LARGEUR du code, pas le zéro lui-même : « porte 03 » reste
    // un code à deux chiffres.
    expect(fakeAddressComplement("porte 03", 7)).toMatch(/^porte \d\d$/);
  });

  it("⚠️ BORNÉ au cas-code : un NOM de résidence garde le chemin d'avant", () => {
    // Le brouillage lettre à lettre en ferait un mot illisible — ce cas ne passe pas ici.
    expect(fakeAddressComplement("Résidence Les Chênes", 7)).toBeNull();
    expect(fakeAddressComplement("12 rue des Lilas", 7)).toBeNull();
  });
});

describe("…et un complément qui PASSE À LA LIGNE (persona courtier, 16/08/2026)", () => {
  /** Un bloc d'adresse se replie. Mesuré : « …, 92600, Asnières,\nappartement A02 » —
   *  le complément partait EN CLAIR pour ce seul motif, alors que la même phrase sur une
   *  ligne l'attrapait. Même arbitrage que le joint `W` des formes d'adresse : ce qui
   *  autorise le repli, c'est que le MOT-CLÉ ancre le morceau. */
  it("un seul retour à la ligne est toléré avant le morceau", () => {
    expect(complements("Le bien est 2 mail Camille du Gast, 92600, Asnières,\nappartement A02, à 385 000 €."))
      .toContain("appartement A02");
  });

  it("⚠️ un SECOND retour ne l'est pas — c'est un autre bloc", () => {
    expect(complements("2 mail Camille du Gast, 92600, Asnières,\n\nappartement A02")).toEqual([]);
  });
});
