import { describe, it, expect } from "vitest";
import { detectSelfHandles } from "./contextFields";

/**
 * ⚠️ RÉGRESSION — « les pseudos ne sont détectés que si on les annonce avec deux points ».
 *
 * Mesuré sur la campagne v1.0 : 6 identifiants sur 13 manqués, tous parce que la forme
 * EN PROSE ne couvrait qu'un nom sans qualificatif suivi de « est ». Personne n'écrit
 * « Pseudo : arvio92 » dans un chat.
 *
 * Trois élargissements, tous adossés au POSSESSIF — c'est lui, et lui seul, qui rend la
 * règle sûre : « le login est obligatoire » ne doit jamais redact « obligatoire ».
 */
const found = (t: string): string[] => detectSelfHandles(t).map((d) => d.value);

describe("pseudo en prose — les formes qu'on écrit vraiment", () => {
  it.each([
    ["Mon pseudo est arvio92.", "arvio92"],
    ["Mon username est darkvador75.", "darkvador75"],
    ["My login is jdoe", "jdoe"],
    ["Mon gamertag est xX_Shadow_Xx.", "xX_Shadow_Xx"], // vocabulaire
    ["Mon identifiant client est 88-45-KL.", "88-45-KL"], // qualificatif
    ["Mon login windows est admin2024", "admin2024"], // qualificatif
    ["Mon id Discord : augustin#4521", "augustin#4521"], // deux-points
  ])("attrape la valeur de « %s »", (text, value) => {
    expect(found(text)).toContain(value);
  });
});

describe("ce qui borne la règle", () => {
  it("SANS possessif, rien — c'est la garde principale", () => {
    expect(found("Le login est obligatoire.")).toEqual([]);
    expect(found("Le compte utilisé est jdupont2.")).toEqual([]);
  });

  it("« id » ne mord pas dans un mot plus long", () => {
    // `(?![\p{L}])` et non `\b` : `\b` est ASCII-only en JS, donc inopérant après un
    // mot accentué (le défaut corrigé dans `rules.tokens.ts`).
    expect(found("Mon idée est excellente.")).toEqual([]);
    expect(found("Mon identité est vérifiée.")).toEqual([]);
  });

  it("UN seul qualificatif, jamais une proposition entière", () => {
    // Deux mots franchiraient une subordonnée et avaleraient n'importe quoi.
    expect(found("Mon identifiant sur le site est bidon")).toEqual([]);
  });

  it("une valeur trop courte n'est pas un identifiant", () => {
    expect(found("Mon pseudo est là.")).toEqual([]);
  });

  it("⚠️ « utilisateur » et l'étiquette NUE restent volontairement hors périmètre", () => {
    // `LABEL_GROUPS` les exclut parce qu'ils sur-déclenchent (« l'utilisateur est
    // content »). Le possessif les rendrait sûrs, mais ces deux formulations-là n'en
    // ont pas — les couvrir est un arbitrage, pas un correctif.
    expect(found("utilisateur : a.vaudel")).toEqual([]);
    expect(found("Mon compte est bloqué.")).toEqual([]);
  });
});

describe("mot de passe en prose — l'ancre est dans la VALEUR, pas le possessif", () => {
  it.each([
    ["le mot de passe est corbeau83", "corbeau83"],
    ["my password is hunter2secret", "hunter2secret"],
    ["le mot de passe applicatif est Zt7rebond", "Zt7rebond"],
    ["das Passwort ist Winter2026", "Winter2026"],
  ])("détecte « %s »", (text, value) => {
    expect(found(text)).toContain(value);
  });

  it("une valeur SANS chiffre/capitale/symbole n'est jamais prise (mot du dictionnaire)", () => {
    expect(found("le mot de passe est obligatoire")).toEqual([]);
    expect(found("the password is required")).toEqual([]);
  });

  /**
   * « Le code du coffre est 4581 » — remonté le 11/08. La forme à DEUX-POINTS était
   * couverte par le détecteur étiqueté, la forme PARLÉE non ; c'est pourtant celle qu'on
   * écrit dans un chat. Un code d'accès n'a aucune forme propre : seule la formulation
   * peut l'attraper.
   */
  it.each([
    ["Le code du coffre est 4581", "4581"],
    ["le code de la porte est A4581", "A4581"],
    ["le code wifi est Maison2026", "Maison2026"],
    ["le code d'accès est 77B12", "77B12"],
  ])("« %s » est un secret", (text, value) => {
    expect(found(text)).toContain(value);
  });

  /** ⚠️ La liste des « code DE quelque chose » est une ALLOW-LIST : un `code de \p{L}+`
   *  générique redact la moitié des phrases qui parlent de règles. */
  it("un « code de » qui n'ouvre rien ne déclenche pas", () => {
    expect(found("le code de la route est clair")).toEqual([]);
    expect(found("le code du travail est dense")).toEqual([]);
  });
});
