import { describe, it, expect } from "vitest";
import { nameGender, pseudonymize, type Vault } from "../index";
import { nameGender as ng } from "./gender";
import { FAKE_FIRST_M, FAKE_FIRST_F } from "./fakes";

describe("nameGender", () => {
  it("classifies common gendered names, tolerant to case/accents/compounds", () => {
    expect(ng("Julien")).toBe("m");
    expect(ng("JULIEN")).toBe("m");
    expect(ng("Léa")).toBe("f");
    expect(ng("lea")).toBe("f"); // accent-insensitive
    expect(ng("Jean-Pierre")).toBe("m"); // compound → lead part
    expect(ng("Marie-Claire")).toBe("f");
    expect(ng("Sarah")).toBe("f");
    // unknown / unisex → null (falls back to any-gender fake)
    expect(ng("Camille")).toBeNull();
    expect(ng("Xyzabc")).toBeNull();
  });
  it("falls back to the generated INSEE sets for names the curated lists don't know", () => {
    // ≥95% single-sex among French births → classified; the documented unisex set stays
    // null even when the INSEE ratio would clear the bar (the generator excludes it).
    expect(ng("Clémence")).toBe("f");
    expect(ng("Jonas")).toBe("m");
    expect(ng("Nolwenn")).toBe("f");
    expect(ng("Dominique")).toBeNull();
  });
  it("is re-exported from the barrel", () => {
    expect(nameGender("Marie")).toBe("f");
  });
});

describe("pseudonymize keeps the fake NAME's gender (so honorifics/pronouns reverse)", () => {
  /** The PARTS of the fake's first name element. A compound real first name is mirrored as
   *  a compound fake ("Jean-Pierre" → "Hugo-Léo" — a `-` joins ONE element, so both halves
   *  come from the first-name pool), hence every part is checked, not just the lead one. */
  const fakeFirstPartsOf = async (name: string): Promise<string[]> => {
    const vault: Vault = {};
    await pseudonymize(`Contact ${name} SVP.`, {
      vault,
      detectLocal: async () => [{ value: name, category: "NAME" }],
    });
    const fake = Object.keys(vault).find((k) => vault[k] === name)!;
    return fake.split(/\s+/)[0].split("-"); // the fake first name element, part by part
  };
  it("a male name gets a MALE fake first name; a female name a FEMALE one", async () => {
    const mSet = new Set(FAKE_FIRST_M);
    const fSet = new Set(FAKE_FIRST_F);
    for (const m of ["Julien Sabourdin", "Jean-Pierre Morvan", "Hugo Berthon"]) {
      const parts = await fakeFirstPartsOf(m);
      expect(parts.every((p) => mSet.has(p))).toBe(true);
    }
    for (const f of ["Marie Rebour", "Sarah Danet", "Chloé Petit"]) {
      const parts = await fakeFirstPartsOf(f);
      expect(parts.every((p) => fSet.has(p))).toBe(true);
    }
  });
  it("mirrors a COMPOUND first name as a compound, each half a distinct pool name", async () => {
    const parts = await fakeFirstPartsOf("Jean-Pierre Morvan");
    expect(parts).toHaveLength(2); // the compound SHAPE survives…
    expect(parts[0]).not.toBe(parts[1]); // …and doesn't collapse to "Hugo-Hugo"
  });
});
