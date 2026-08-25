import { describe, expect, it } from "vitest";
import { pseudonymize } from "./pseudonymize";
import { applyVault, unredact } from "../engine/vault";
import { isWordGlued } from "../util";
import type { Vault } from "../types";

const modelReturning = (findings: { value: string; category: string }[]) => async () =>
  JSON.stringify(findings);

describe("whole-word matching — no substring corruption", () => {
  it("a short model entity ('us'/'ca') is never redacted INSIDE a word", async () => {
    const input = "Nous avons vu plus de choses. Canva et car restent intacts. US est isolé.";
    const vault: Vault = {};
    const { text } = await pseudonymize(input, {
      complete: modelReturning([
        { value: "us", category: "ORG" },
        { value: "ca", category: "ORG" },
      ]),
      vault,
    });
    // Words that merely CONTAIN the substrings must survive intact.
    for (const w of ["Nous", "plus", "Canva", "car", "restent", "choses"]) {
      expect(text).toContain(w);
    }
    // The standalone occurrence IS still redacted (no bare us / US / ca left).
    expect(text).not.toMatch(/\bus\b/i);
    expect(text).not.toMatch(/\bca\b/i);
  });

  it("isWordGlued: substring inside a word is glued; standalone / punctuation-edged is not", () => {
    expect(isWordGlued("plus", 2, "us")).toBe(true);
    expect(isWordGlued("vous", 2, "us")).toBe(true);
    expect(isWordGlued("Canva", 0, "Ca")).toBe(true);
    expect(isWordGlued("US only", 0, "US")).toBe(false);
    expect(isWordGlued("a us b", 2, "us")).toBe(false);
    expect(isWordGlued("Charvet part", 0, "Charvet")).toBe(false); // accents intact
    expect(isWordGlued("x a@b.com y", 2, "a@b.com")).toBe(false);
  });

  it("applyVault / unredact respect word boundaries", () => {
    const vault: Vault = { FAKENAME: "us" };
    expect(applyVault("plus us vous", vault)).toBe("plus FAKENAME vous");
    expect(unredact("plus FAKENAME vous", vault)).toBe("plus us vous");
  });
});
