import { describe, expect, it } from "vitest";
import { isCurrency } from "./currencies";
import { isGenericTerm } from "./detect";
import { pseudonymize } from "./pseudonymize";
import type { Vault } from "../types";

// Simulate the AI detector returning the findings `detectWithModel` expects.
const modelReturning = (f: { value: string; category: string }[]) => async () =>
  JSON.stringify(f);

describe("currency dictionary", () => {
  it("recognises ISO codes / symbols / names, any casing & separators", () => {
    for (const v of ["EUR", "eur", "E.U.R", "usd", "GBP", "JPY", "CHF", "CNY", "€", "£", "¥", "euro", "Euros", "dollar", "yen", "yuan", "rupee"]) {
      expect(isCurrency(v)).toBe(true);
      expect(isGenericTerm(v)).toBe(true); // wired into the shared deny-list gate
    }
  });

  it("does NOT allow-list a name that only LOOKS like a code (no leak)", () => {
    // BOB is a real ISO code (Bolivian boliviano) but a common first name → we must
    // still be able to redact a person "Bob"; likewise real entities aren't currencies.
    expect(isCurrency("Bob")).toBe(false);
    expect(isCurrency("Sabourdin")).toBe(false);
    expect(isCurrency("Sacem")).toBe(false);
    // omitted name-colliding currency words stay redactable
    for (const v of ["Franc", "Mark", "Rand", "Won"]) expect(isCurrency(v)).toBe(false);
  });

  it("a bare currency code detected as ORG is left in CLEAR (repro: EUR → ASH)", async () => {
    const input = "Le montant total est de 1250 EUR.";
    const vault: Vault = {};
    const { text } = await pseudonymize(input, {
      complete: modelReturning([{ value: "EUR", category: "ORG" }]),
      vault,
      numbers: false,
    });
    expect(text).toContain("EUR"); // the currency survives — no fake
    expect(text).toBe(input); // nothing redacted at all
    expect(Object.keys(vault)).toHaveLength(0);
  });

  it("still redacts a real entity sitting next to a currency", async () => {
    const input = "SABOURDIN Julien a payé 1250 EUR.";
    const vault: Vault = {};
    const { text } = await pseudonymize(input, {
      complete: modelReturning([
        { value: "SABOURDIN Julien", category: "NAME" },
        { value: "EUR", category: "ORG" },
      ]),
      vault,
      numbers: false,
    });
    expect(text).toContain("EUR"); // currency spared
    expect(text).not.toContain("SABOURDIN Julien"); // the person is still redacted
  });
});
