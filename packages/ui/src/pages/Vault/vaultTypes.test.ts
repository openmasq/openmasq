import { describe, expect, it } from "vitest";
import { REDACT_TYPES } from "@openmasq/redact";
import { FREQUENT_TYPE_KEYS, guessVaultToken, DEFAULT_TOKEN } from "./vaultTypes";

/** The add modal infers the category from the value, with the SAME detectors the send
 *  runs — these pin the four shapes the modal promises, and that a plain word is never
 *  guessed (it falls back to the default, a name). */
describe("guessVaultToken — the category from the value's shape", () => {
  it("recognises an e-mail, a phone, an IBAN and a card", () => {
    expect(guessVaultToken("jean.dupont@example.com")).toBe("EMAIL");
    expect(guessVaultToken("+33 6 12 34 56 78")).toBe("PHONE");
    expect(guessVaultToken("FR76 3000 6000 0112 3456 7890 189")).toBe("IBAN");
    expect(guessVaultToken("4111 1111 1111 1111")).toBe("CARD");
  });

  it("guesses nothing for a code name or a person's name — the Coffre's daily case", () => {
    expect(guessVaultToken("Projet Northwind")).toBeNull();
    expect(guessVaultToken("Marie Curie")).toBeNull();
    expect(guessVaultToken("ab")).toBeNull();
  });

  it("refuses a partial match: a name that CONTAINS a number is not an identifier", () => {
    expect(guessVaultToken("Compte Nord 2024 chez jean@example.com")).toBeNull();
  });

  it("the frequent categories and the default are real engine types", () => {
    const keys = new Set(REDACT_TYPES.map((t) => t.key));
    for (const k of FREQUENT_TYPE_KEYS) expect(keys.has(k)).toBe(true);
    expect(REDACT_TYPES.some((t) => t.token === DEFAULT_TOKEN)).toBe(true);
  });
});
