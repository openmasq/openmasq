import { describe, it, expect } from "vitest";
import { pseudonymize, type Vault } from "./index";
import { isDateTimeRun } from "./engine/validators/validators";

/* Régression sur un RELEVÉ BANCAIRE (export CSV Qonto/Revolut) — journal du 01/08 :
   deux over-redactions distincts corrompaient le relevé rendu au modèle.
   1. Les datetimes « DD-MM-YYYY HH:MM:SS » matchaient la règle téléphone FR (10 chiffres
      commençant par 0) → fakés (« 01-28-8322 42:24:55 ») : années impossibles, chronologie
      détruite, irréversible dans le raisonnement du modèle.
   2. « Frais Revolut Business » lu comme un NOM minait l'alias mot-à-mot frais→<prénom>
      (idem business→<patronyme>) : chaque « Frais d'abonnement » du relevé était réécrit.
   L'IBAN et le vrai bénéficiaire, eux, doivent RESTER redacted. */

describe("relevé bancaire — dates et vocabulaire intacts, PII toujours redacted", () => {
  it("laisse les datetimes DD-MM-YYYY HH:MM:SS en clair (plus jamais « téléphone »)", async () => {
    const line =
      "Exécuté;01-09-2025 01:24:55;01-09-2025 03:24:55;01-09-2025 01:24:54;20-06-2025 09:51:15;-12,63";
    const { text, matches } = await pseudonymize(line, { vault: {}, numbers: false });
    expect(text).toBe(line);
    expect(matches).toEqual([]);
  });

  it("le préfixe date nue « 01-09-2025 » n'est pas re-béni par longestValidPrefix", () => {
    expect(isDateTimeRun("01-09-2025 01")).toBe(true);
    expect(isDateTimeRun("01-09-2025")).toBe(true); // la date SANS l'heure aussi
    expect(isDateTimeRun("01-42-68-53")).toBe(false); // un vrai téléphone tronqué, non
  });

  it("un vrai numéro FR reste redacted (le garde ne coûte aucun rappel)", async () => {
    const { text } = await pseudonymize("rappelle le 06 12 34 56 78", { vault: {} });
    expect(text).not.toContain("06 12 34 56 78");
  });

  it("« Frais Revolut Business » ne mint d'alias ni pour « frais » ni pour « business »", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize(
      "Description: Frais Revolut Business — Frais d'abonnement Basic, business plan joint",
      { vault, forced: [{ value: "Frais Revolut Business", category: "NAME" }] },
    );
    // Les mots du lexique restent verbatim partout ailleurs dans le relevé…
    expect(text).toContain("Frais d'abonnement Basic");
    expect(text).toContain("business plan");
    // …et aucun alias mot-à-mot n'existe pour eux dans le coffre.
    for (const real of Object.values(vault)) {
      expect(["frais", "business"]).not.toContain(real.toLowerCase());
    }
  });

  it("l'IBAN de la ligne reste redacted (aucune détente du rappel)", async () => {
    const line = "Compte principal;FR7630052114000012734500101;STRIPE;Transférer";
    const { text } = await pseudonymize(line, { vault: {}, numbers: false });
    expect(text).not.toContain("FR7630052114000012734500101");
  });
});
