import { describe, it, expect } from "vitest";
import { redact } from "../../index";

/**
 * ⚠️ REGRESSION — une date de naissance écrite en toutes lettres n'était JAMAIS détectée.
 *
 * Mesuré sur le benchmark v1.0 : 8 formes sur 18. Tout ce qui était en chiffres passait,
 * tout ce qui était en lettres passait à travers, sans exception — et deux formes en
 * chiffres échouaient aussi parce que leur préfixe (« DDN », « Né(e) le ») n'était pas
 * reconnu.
 *
 * Deux causes distinctes, corrigées ensemble :
 *  1. `DATE_CORE` n'acceptait que du numérique ;
 *  2. le connecteur (« est le », « en », « un ») tombait dans le trou `\W{0,15}`, qui ne
 *     franchit que des caractères NON alphabétiques — donc « né en 1988 » n'atteignait
 *     jamais la date même une fois les mois littéraux ajoutés.
 */

const isDob = (text: string): boolean => redact(text).matches.some((m) => m.type === "dob");

describe("dates de naissance — toutes lettres, partielles, préfixes", () => {
  it.each([
    "Née le 14 mars 1988",
    "Son anniversaire est le 3 juillet 1992",
    "Elle est née le 29 février 1996",
    "Il est né un 1er avril 1980",
    "Sa date de naissance est le 8 janvier 2003",
    "Née le 17 novembre 1982",
    "Né en 1988", // année seule
    "Ma fille est née en mars 2015", // mois + année
    "DDN : 07/09/2001",
    "Né(e) le : 15/06/1990",
  ])("détecte « %s »", (text) => expect(isDob(text)).toBe(true));

  it.each([
    "Né le 14/03/1988",
    "Born on 05/08/1994",
    "date de naissance 1988-03-14",
    "Né le 31-01-1955",
    "Né le 23/12/1969",
  ])("n'a rien cassé sur « %s » (déjà détecté avant)", (text) => expect(isDob(text)).toBe(true));
});

/**
 * La contrepartie, et c'est elle qui borne le risque : la règle reste ADOSSÉE à un
 * contexte de naissance. Une date sans ce contexte n'est pas une donnée sensible — la
 * redact casserait chaque planning, facture et échéance d'une conversation de travail.
 */
describe("le « Né(e) le » MUTILÉ par l'OCR (carte d'identité scannée)", () => {
  // Fuite vécue (parcours 14/08, CNI réelle) : « SexeE M    Néle)le : 01.08.1996 » —
  // l'OCR soude et mélange « Né(e) le », le connecteur n'y voit plus « le », et le trou
  // `\W{0,15}` ne franchit pas les lettres du débris : la date de naissance RÉELLE
  // partait en clair pendant que nom/prénom/lieu étaient masqués.
  it("détecte la date derrière le label soudé/mélangé", () => {
    expect(isDob("SexeE M    Néle)le : 01.08.1996")).toBe(true);
    expect(isDob("Né(e)le: 12.03.1985 à BASTIA")).toBe(true);
    expect(isDob("Née)le : 07/11/1990")).toBe(true);
  });
  it("« année » et un mot commençant par né restent hors de portée", () => {
    expect(isDob("l'année 2024 fut bonne, total 12.03.1985 unités")).toBe(false);
    expect(isDob("le prix Nobel 01.08.1996 …")).toBe(false);
  });
});

describe("une date SANS contexte de naissance reste en clair", () => {
  it.each([
    "Réunion le 14 mars 1988",
    "La facture du 3 juillet 1992 est réglée",
    "Le contrat expire en 2027",
    "Livraison prévue en mars 2015",
  ])("laisse « %s »", (text) => expect(isDob(text)).toBe(false));

  /**
   * ⚠️ Le piège que l'ajout de l'année-seule crée, et la raison du `\b` dans `BORN` :
   * « née » vit à l'intérieur d'« année ». Sans l'ancre, « Bonne année 2025 » se lisait
   * comme une naissance. C'est le cas qui rend la règle année-seule sûre — l'enlever
   * redact un millésime sur deux dans une conversation ordinaire.
   */
  it.each([
    "Bonne année 2025 à tous",
    "L'année 2024 a été difficile",
    "cette année 1988 restera",
    "Chiffre d'affaires de l'année : 2024",
    "Une donnée en 2019",
  ])("« %s » — « née » à l'intérieur d'un mot n'amorce rien", (text) =>
    expect(isDob(text)).toBe(false),
  );
});
