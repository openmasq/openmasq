import { describe, expect, it } from "vitest";
import { fakeBitcoinLegacyAddress, isBitcoinLegacyAddress } from "./base58check";
import { pseudonymize, redact } from "../../index";

/** De VRAIES adresses, seules à prouver quelque chose : une adresse inventée passerait le
 *  test sans rien dire (barre du `engine/CLAUDE.md` : des vecteurs checksum-valides).
 *  Bloc de genèse, bloc 170, et une P2SH. */
const REELLES = [
  "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
  "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
];

describe("base58check — la preuve d'une adresse Bitcoin héritée", () => {
  it("une vraie adresse passe TOUJOURS — le validateur ne peut pas coûter de couverture", () => {
    for (const a of REELLES) expect(isBitcoinLegacyAddress(a)).toBe(true);
  });

  it("…et un caractère changé ne passe plus : c'est la somme de contrôle qui parle", () => {
    // Muter le dernier caractère laisse la FORME intacte — seule la somme distingue.
    for (const a of REELLES) {
      const mute = a.slice(0, -1) + (a.endsWith("a") ? "b" : "a");
      expect(isBitcoinLegacyAddress(mute)).toBe(false);
    }
  });

  it("l'id de page Notion qui a causé tout ceci ne passe pas", () => {
    // Forme identique à une adresse : 32 caractères base58, commence par « 3 ».
    expect(isBitcoinLegacyAddress("36db8e7d426681e79f43d3395ddc1f87")).toBe(false);
  });

  it("ni un caractère hors alphabet, ni une longueur d'octets non conforme", () => {
    expect(isBitcoinLegacyAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7Div0Na")).toBe(false); // « 0 »
    expect(isBitcoinLegacyAddress("1111111111")).toBe(false);
    expect(isBitcoinLegacyAddress("")).toBe(false);
  });
});

describe("…et ce que ça change dans le moteur", () => {
  it("l'id de page n'est plus redacted, la vraie adresse l'est toujours", async () => {
    // ⚠️ Le symptôme d'origine : `crypto` mappe sur `secret`, exempté de la garde URL, donc
    // l'id partait redacted même à l'intérieur d'une URL, quel que soit le réglage.
    expect((await redact("id de page 36db8e7d426681e79f43d3395ddc1f87", {})).text)
      .toContain("36db8e7d426681e79f43d3395ddc1f87");
    expect((await redact(`paiement vers ${REELLES[0]}`, {})).text).not.toContain(REELLES[0]);
  });

  it("la branche bech32 n'a pas bougé — son préfixe littéral la qualifie seul", async () => {
    const bech = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
    expect((await redact(`paiement vers ${bech}`, {})).text).not.toContain(bech);
  });
});

describe("le FAUX d'une adresse passe la MÊME somme (16/08/2026)", () => {
  /** Depuis que la DÉTECTION exige le base58check, un faux brouillé caractère par
   *  caractère ne serait même pas re-reconnu comme une adresse par notre propre moteur —
   *  et un faux qui échoue à sa somme invite le modèle à le « corriger », correction qui ne
   *  se retourne plus (`model/CLAUDE.md`). */
  it("chaque vraie adresse reçoit un faux VALIDE", () => {
    for (const a of REELLES) {
      const f = fakeBitcoinLegacyAddress(a, 42)!;
      expect(f).not.toBe(a);
      expect(isBitcoinLegacyAddress(f)).toBe(true);
    }
  });

  it("la VERSION est conservée — « 1… » reste « 1… », « 3… » reste « 3… »", () => {
    expect(fakeBitcoinLegacyAddress(REELLES[0], 42)![0]).toBe("1");
    expect(fakeBitcoinLegacyAddress(REELLES[2], 42)![0]).toBe("3");
  });

  it("déterministe : même valeur + même graine → même faux", () => {
    expect(fakeBitcoinLegacyAddress(REELLES[0], 7)).toBe(fakeBitcoinLegacyAddress(REELLES[0], 7));
    expect(fakeBitcoinLegacyAddress(REELLES[0], 7)).not.toBe(fakeBitcoinLegacyAddress(REELLES[0], 8));
  });

  it("`null` sur ce qui n'est pas une adresse héritée — l'appelant garde son brouillage", () => {
    // bech32 compris : sa preuve est son préfixe littéral, pas une somme.
    expect(fakeBitcoinLegacyAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", 1)).toBeNull();
    expect(fakeBitcoinLegacyAddress("36db8e7d426681e79f43d3395ddc1f87", 1)).toBeNull();
  });
});

describe("…et de bout en bout", () => {
  it("le faux minté par le moteur est une adresse valide", async () => {
    const vault: Record<string, string> = {};
    await pseudonymize(`paiement vers ${REELLES[0]}`, { vault });
    const fake = Object.keys(vault)[0];
    expect(isBitcoinLegacyAddress(fake)).toBe(true);
  });
});
