import { describe, it, expect } from "vitest";
import { redact } from "../../index";

/**
 * ⚠️ REGRESSION — a birth date spelled out in words was NEVER detected.
 *
 * Measured on the v1.0 benchmark: 8 forms out of 18. Everything in digits passed,
 * everything in letters fell through, without exception — and two digit
 * forms also failed because their prefix (« DDN », « Né(e) le ») was not
 * recognized.
 *
 * Two distinct causes, fixed together:
 *  1. `DATE_CORE` only accepted numerals;
 *  2. the connector (« est le », « en », « un ») fell into the `\W{0,15}` gap, which only
 *     crosses NON-alphabetic characters — so « né en 1988 » never
 *     reached the date even once literal month names were added.
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
    "Né en 1988", // year alone
    "Ma fille est née en mars 2015", // month + year
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
 * The counterpart, and it's what bounds the risk: the rule stays ANCHORED to a
 * birth context. A date without that context is not sensitive data — redacting it
 * would break every schedule, invoice and deadline in a work conversation.
 */
describe("le « Né(e) le » MUTILÉ par l'OCR (carte d'identité scannée)", () => {
  // Real leak (walkthrough 14/08, real CNI): « SexeE M    Néle)le : 01.08.1996 » —
  // the OCR fuses and scrambles « Né(e) le », the connector no longer sees a "le" in it, and
  // the `\W{0,15}` gap doesn't cross the debris letters: the REAL birth date
  // was going out in clear while name/first name/place were masked.
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
   * ⚠️ The trap that adding the year-alone form creates, and the reason for the `\b` in `BORN`:
   * « née » lives inside « année ». Without the anchor, « Bonne année 2025 » was read
   * as a birth. This is the case that makes the year-alone rule safe — removing it
   * would redact every other year figure in an ordinary conversation.
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
