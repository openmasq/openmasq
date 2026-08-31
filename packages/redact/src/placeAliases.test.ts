import { describe, it, expect } from "vitest";
import { pseudonymize, unredact } from "./index";
import { placeAliases } from "./model/identity/place";

/* Regression on a real notarial deed.

   The vault held « LORIENT (56100) → ST OUEN (93400) » — town and postal code in ONE
   key, deliberately, so the fake code stays consistent with the fake town. But the
   model writes the town alone (« le bien est situé à Lorient »), a fragment is not a
   key, and restitution left it as-is. The user therefore read, in their own
   analysis, that the property was in Lorient. It is in Saint-Ouen.

   ⚠️ This is the SYMMETRIC failure of a leak: nothing real got out, but a fabricated fact
   got in as if it were the user's own, without the slightest signal. A fake that cannot
   come back is not protection, it's a lie. */

describe("place composite — la ville seule doit revenir", () => {
  it("restitue la ville et le code postal cités séparément", async () => {
    const vault: Record<string, string> = {};
    await pseudonymize("Un bien sis à ST OUEN (93400) 31 rue Villa Ancelle.", { vault });
    const composite = Object.keys(vault).find((k) => /\(\d{5}\)/.test(k));
    expect(composite, "le détecteur géo doit produire le composite ville+code").toBeTruthy();
    const fakeTown = composite!.split(" (")[0];
    const fakeCode = /\((\d+)\)/.exec(composite!)![1];
    const titled = fakeTown.charAt(0) + fakeTown.slice(1).toLowerCase();

    // As the model actually writes it: the town alone, in sentence case.
    expect(unredact(`Le bien est situé à ${titled}.`, vault)).toMatch(/ouen/i);
    // And the postal code alone, which a model happily copies into a table.
    expect(unredact(`Code postal ${fakeCode}.`, vault)).toContain("93400");
    // The full form obviously still comes back.
    expect(unredact(`Situé à ${composite}.`, vault)).toContain("ST OUEN (93400)");
  });

  it("n'aligne QUE des décompositions identiques — sinon aucun alias", () => {
    // A misaligned alias would point a fragment to the WRONG real value, which
    // is far worse than not restoring at all: we prefer to emit nothing.
    expect(placeAliases("ST OUEN (93400)", "LORIENT")).toEqual([]);
    expect(placeAliases("ST OUEN", "LORIENT (56100)")).toEqual([]);
    expect(placeAliases("une phrase sans code", "une autre phrase")).toEqual([]);
  });

  it("couvre les trois formes qu'une adresse française prend", () => {
    const paren = placeAliases("ST OUEN (93400)", "LORIENT (56100)");
    const prefix = placeAliases("93400 ST OUEN", "56100 LORIENT");
    const suffix = placeAliases("ST OUEN 93400", "LORIENT 56100");
    for (const [nom, pairs] of [["(code)", paren], ["code ville", prefix], ["ville code", suffix]] as const) {
      const map = new Map(pairs);
      expect(map.get("56100"), nom).toBe("93400");
      expect(map.get("LORIENT"), nom).toBe("ST OUEN");
      expect(map.get("Lorient"), nom).toBe("St Ouen");
    }
  });

  it("répare un coffre DÉJÀ écrit — sans le réécrire", () => {
    // The exact vault from the log: only the composite, no fragment alias.
    // Existing conversations must heal without migration or rewriting.
    const ancien = {
      "LORIENT (56100)": "ST OUEN (93400)",
      ANTOINE: "BELMADANI",
      CLARA: "SABOURDIN",
    };
    const copie = { ...ancien };
    const out = unredact(
      "Un bien immobilier situé à Lorient, promesse entre M. SABOURDIN et M. BELMADANI.",
      ancien,
    );
    expect(out).toContain("St Ouen");
    // The derivation is READ-ONLY: the stored vault does not move.
    expect(ancien).toEqual(copie);
  });

  it("une entrée EXISTANTE l'emporte toujours sur une dérivation", () => {
    const vault = { "LORIENT (56100)": "ST OUEN (93400)", LORIENT: "VANNES" };
    expect(unredact("à LORIENT", vault)).toContain("VANNES");
  });

  it("n'émet pas d'alias identité quand le faux a gardé la vraie part", () => {
    // Aliasing a value to itself would clutter the vault forever without restoring anything.
    expect(placeAliases("ST OUEN (93400)", "LORIENT (93400)").some(([k]) => k === "93400")).toBe(false);
  });
});
