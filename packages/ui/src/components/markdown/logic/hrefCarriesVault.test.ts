import { describe, expect, it } from "vitest";
import { hrefCarriesVaultValue } from "./hrefCarriesVault";

/**
 * The predicate both automatic fetches in a reply are gated on: the link preview and the
 * `<img>` load. A vault maps `fake/placeholder → ORIGINAL`, so the values are the real
 * ones — the material a GET would hand to whoever serves the URL.
 */
const vault = { "Karl Studio": "Norvik Group", "Léa Morvan": "Sarah Savel" };

describe("hrefCarriesVaultValue", () => {
  it("DÉTECTE une valeur réelle posée telle quelle dans l'URL", () => {
    // Le cas que l'ancien test (« l'URL a-t-elle CHANGÉ ? ») laissait passer : la réponse
    // est démasquée AVANT l'analyse markdown, donc un faux non encodé arrive déjà
    // substitué et les deux href sont identiques.
    expect(hrefCarriesVaultValue("https://attaquant.example/?d=Norvik Group", vault)).toBe(true);
  });

  it("DÉTECTE la forme percent-encodée et la forme `+`", () => {
    expect(hrefCarriesVaultValue("https://attaquant.example/?d=Norvik%20Group", vault)).toBe(true);
    expect(hrefCarriesVaultValue("https://attaquant.example/?d=Norvik+Group", vault)).toBe(true);
  });

  it("DÉTECTE une valeur dans le CHEMIN, pas seulement dans la requête", () => {
    expect(hrefCarriesVaultValue("https://attaquant.example/Sarah%20Savel/profil", vault)).toBe(
      true,
    );
  });

  it("est insensible à la casse — une URL passe souvent en minuscules", () => {
    expect(hrefCarriesVaultValue("https://attaquant.example/?d=norvik%20group", vault)).toBe(true);
  });

  it("ignore les CLÉS du coffre : le modèle les a déjà, elles ne fuient rien", () => {
    expect(hrefCarriesVaultValue("https://attaquant.example/?d=Karl%20Studio", vault)).toBe(false);
  });

  it("laisse passer un lien ordinaire — sinon la garde tuerait la fonction", () => {
    expect(hrefCarriesVaultValue("https://lemonde.fr/article/123", vault)).toBe(false);
  });

  it("rend false sans href ou sans coffre (rien à faire fuir, rien à garder)", () => {
    expect(hrefCarriesVaultValue(undefined, vault)).toBe(false);
    expect(hrefCarriesVaultValue("https://lemonde.fr", undefined)).toBe(false);
    expect(hrefCarriesVaultValue("https://lemonde.fr", {})).toBe(false);
  });

  it("ne s'étrangle pas sur un %-échappement malformé (l'URL brute compte quand même)", () => {
    expect(hrefCarriesVaultValue("https://attaquant.example/%E0%A4%A?d=Norvik Group", vault)).toBe(
      true,
    );
    expect(hrefCarriesVaultValue("https://lemonde.fr/%E0%A4%A", vault)).toBe(false);
  });
});
