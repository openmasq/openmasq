import { describe, it, expect } from "vitest";
import { pseudonymize } from "../index";
import { discoverSecrets } from "./detect";
import { isNonPiiTerm, isGenericTerm } from "./genericTerms";
import type { Detection } from "../types";

/**
 * ⚠️ REGRESSION — le mot qui ANNONCE la donnée était redacted à la place de la donnée.
 *
 * Mesuré sur le benchmark v1.0 (~7 % des messages touchés, précision 93 %) : « Mon
 * passeport est périmé » partait au modèle en « Mon Simon est périmé ». C'est le pire
 * des faux positifs parce qu'il est INVISIBLE — l'utilisateur relit sa phrase restaurée,
 * ne voit rien d'anormal, et conclut que le modèle répond mal. Un OUBLI se voit (rien
 * n'est surligné) et se rattrape par le Coffre ; celui-ci ne se voit pas.
 *
 * Le mot désigne le TYPE de pièce, jamais son titulaire.
 */

/** Ce que rend un NER qui tague le mot-catégorie — la sortie réellement observée. */
const tags = (value: string, category = "PER") =>
  async (): Promise<Detection[]> => [{ value, category }];

describe("un mot-catégorie n'est jamais redacted pour lui-même", () => {
  it.each([
    ["Mon passeport est périmé.", "passeport"],
    ["J'ai perdu ma CNI.", "CNI"],
    ["Mon numéro de sécu est le 1 84 12 75 123 456 78.", "sécu"],
    ["Mon gamertag est xX_Shadow_Xx.", "gamertag"],
  ])("%s", async (text, label) => {
    const out = await pseudonymize(text, { detectLocal: tags(label) });
    expect(out.text).toContain(label);
  });

  it("laisse en clair le LABEL mais redacted bien la VALEUR qui le suit", () => {
    // Le contre-test qui empêche la correction de devenir une perte de rappel : on
    // n'a pas éteint la détection, on a juste cessé de viser le mauvais mot.
    return pseudonymize("Mon login est arvio92.", { detectLocal: tags("login") }).then((out) => {
      expect(out.text).toContain("login");
      expect(out.text).not.toContain("arvio92");
    });
  });
});

describe("isNonPiiTerm — UNE définition, partagée par les trois chemins", () => {
  /**
   * Les trois sites avaient dérivé vers trois réponses différentes à la même question
   * (root rule 9) : la même valeur pouvait être épargnée en mode FAKE et redacted en
   * mode MARQUEUR. Ce test compare les deux modes sur la même entrée.
   */
  it("le mode marqueur épargne exactement ce que le mode fake épargne", async () => {
    for (const label of ["passeport", "CNI", "sécu", "gamertag", "iban", "Le login"]) {
      const text = `Voici : ${label} ici.`;
      const marked = await discoverSecrets(text, { detectLocal: tags(label) });
      const faked = await pseudonymize(text, { detectLocal: tags(label) });
      expect(marked, `mode marqueur a redacted ${label}`).toEqual([]);
      expect(faked.text, `mode fake a redacted ${label}`).toContain(label);
    }
  });

  it("réunit bien les quatre prédicats (mot, composé, article, stopword)", () => {
    expect(isNonPiiTerm("passeport")).toBe(true); // terme générique
    expect(isNonPiiTerm("Le login")).toBe(true); // article + terme
    expect(isNonPiiTerm("read-data-schema")).toBe(true); // composé
    expect(isNonPiiTerm("Berlioz")).toBe(false); // un vrai nom reste redactable
  });
});

describe("la discipline d'allow-list tient (vocab/index.ts règle 2)", () => {
  it("« signe » reste redactable — c'est un prénom scandinave", () => {
    // Le jumeau ASCII de « signé » est DÉLIBÉRÉMENT absent de la liste : une entrée
    // d'allow-list expédie ce mot en clair pour toujours, et « Signe » est un prénom.
    expect(isGenericTerm("signe")).toBe(false);
    expect(isNonPiiTerm("signe")).toBe(false);
  });

  it("les entrées ajoutées gardent leur forme ACCENTUÉE et son jumeau ASCII", () => {
    // « sécu » est ce qu'on tape ; « secu » est ce que produit un export dégradé.
    expect(isGenericTerm("sécu")).toBe(true);
    expect(isGenericTerm("secu")).toBe(true);
  });
});
