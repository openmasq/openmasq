import { describe, it, expect } from "vitest";
import { pseudonymize } from "./index";
import type { Vault } from "./index";
import { isBareYear } from "./model/pseudonymizeNumbers";

/**
 * `numbers: true` tokenises standalone quantities to `n1`/`n2` so the model computes
 * symbolically. Two things it must NOT touch — the reported financial-output corruption:
 * a bare calendar YEAR (a year label) and a digit run GLUED inside an alphanumeric
 * identifier (a stock ticker / ISIN). Both would poison the vault and mangle results.
 */
describe("numbers tokenisation — millésime & ticker/ISIN carve-outs", () => {
  it("does NOT tokenise a bare year (millésime)", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize("Les meilleurs ETF PEA performants en 2026.", {
      vault,
      numbers: true,
    });
    expect(text).toContain("2026"); // left in clear, model reads the real year
    expect(Object.values(vault)).not.toContain("2026"); // never vaulted
  });

  it("does NOT fragment an ISIN / ticker digit run", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize("Cours de l'ETF FR0011871110 et de IE00B53L3W79.", {
      vault,
      numbers: true,
    });
    expect(text).toContain("FR0011871110"); // identifier stays intact
    expect(text).toContain("IE00B53L3W79");
    // No fragment of either was vaulted (would corrupt the ISIN on apply).
    for (const v of Object.values(vault)) {
      expect("FR0011871110").not.toContain(v);
      expect("IE00B53L3W79").not.toContain(v);
    }
  });

  it("STILL tokenises a genuine standalone quantity (the feature keeps working)", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize("La commande porte sur 850 unités.", {
      vault,
      numbers: true,
    });
    expect(text).not.toContain("850"); // hidden from the model
    expect(Object.values(vault)).toContain("850"); // reversible via the vault
  });

  it("a checksum-INVALID look-alike is STILL redacted (the ISIN carve-out is check-digit gated)", async () => {
    const vault: Vault = {};
    // FR0011871111 has a bad ISIN check digit → not spared → the api_token rule still fakes it,
    // so a random 12-char alnum can't masquerade as a public identifier to leak in clear.
    const { text } = await pseudonymize("Référence interne FR0011871111 confidentielle.", { vault });
    expect(text).not.toContain("FR0011871111");
  });

  it("isBareYear pins the 1900–2099 range", () => {
    expect(isBareYear("2026")).toBe(true);
    expect(isBareYear("1999")).toBe(true);
    expect(isBareYear("1899")).toBe(false);
    expect(isBareYear("2150")).toBe(false);
    expect(isBareYear("850")).toBe(false); // 3 digits — a quantity, still tokenised
    expect(isBareYear("20260")).toBe(false);
  });
});
