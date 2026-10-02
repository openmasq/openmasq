import { describe, expect, it } from "vitest";
import { pseudonymize } from "../../index";
import { detectFiscalNumbers } from "../labels/numbers";

/** French administrative numbers: the tax notice's compact prints and its other labels, the
 *  fiscal number with a qualifier, the foreigner number, benefits. */
describe("French administrative identifiers", () => {
  const out = async (t: string) => (await pseudonymize(t, { vault: {}, numbers: false })).text;

  it.each([
    ["numéro fiscal du déclarant 1 23 45 678 901 23", "1 23 45 678 901 23"],
    ["Numéro FIP : 3012345678901", "3012345678901"],
    ["N° FIP 2345678901234", "2345678901234"],
    ["Référence de l'avis : 2533A12345678", "2533A12345678"],
    ["N° d'accès en ligne : 123456789012", "123456789012"],
    ["Numéro de télédéclarant : 1234567890123", "1234567890123"],
    ["Numéro invariant : 123456789012", "123456789012"],
    ["Numéro de taxe d'habitation : 91234567890", "91234567890"],
    ["N° étranger : 7512345678", "7512345678"],
    ["Numéro MSA : 1234567", "1234567"],
    ["Numéro de bénéficiaire : 9876543210", "9876543210"],
    ["Numéro de mutuelle : 123456789", "123456789"],
  ])("%s", async (text, value) => {
    expect(await out(text)).not.toContain(value);
  });

  it.each([
    "le rôle de chacun est clair",
    "Ce résultat reste invariant depuis 2019.",
    "La taxe d'habitation a été supprimée en 2023.",
    "un rôle 2024 important",
    "Accès en ligne gratuit pendant 30 jours",
  ])("leaves %s alone", async (text) => {
    expect(await out(text)).toBe(text);
  });

  it("a long run of tabs after a fiscal label stays linear", () => {
    // The old « class* :? \s* » separator chain was polynomial: ~160 ms for 10 000 tabs,
    // seconds for 100 000 (CodeQL js/polynomial-redos).
    const t = Date.now();
    detectFiscalNumbers(`numéro fiscal${"\t".repeat(100_000)}x`);
    expect(Date.now() - t).toBeLessThan(500);
  });
});
