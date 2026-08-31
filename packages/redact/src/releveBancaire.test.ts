import { describe, it, expect } from "vitest";
import { pseudonymize, type Vault } from "./index";
import { isDateTimeRun } from "./engine/validators/validators";

/* Regression on a BANK STATEMENT (Qonto/Revolut CSV export) — 01/08 log entry:
   two distinct over-redactions were corrupting the statement handed to the model.
   1. The datetimes "DD-MM-YYYY HH:MM:SS" matched the FR phone rule (10 digits
      starting with 0) → faked ("01-28-8322 42:24:55"): impossible years, chronology
      destroyed, irreversible in the model's reasoning.
   2. "Frais Revolut Business" read as a NAME was minting a word-for-word alias frais→<first name>
      (same for business→<surname>): every "Frais d'abonnement" in the statement got rewritten.
   The IBAN and the real payee, on the other hand, must STAY redacted. */

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
    expect(isDateTimeRun("01-09-2025")).toBe(true); // the date WITHOUT the time too
    expect(isDateTimeRun("01-42-68-53")).toBe(false); // a genuine truncated phone number, right not to match
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
    // The lexicon words stay verbatim everywhere else in the statement…
    expect(text).toContain("Frais d'abonnement Basic");
    expect(text).toContain("business plan");
    // …and no word-for-word alias exists for them in the vault.
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
