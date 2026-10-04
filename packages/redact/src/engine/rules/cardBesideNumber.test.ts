import { describe, expect, it } from "vitest";
import { pseudonymize } from "../../index";
import { isIdBesideNumber } from "../validators";

/** A 14-digit SIRET and the house number after it read 16 digits that can pass Luhn. Taken as a
 *  card, the span swallowed the number and the street it began was never substituted. */
describe("card rule — an identifier beside another number is not a card", () => {
  it("the street after a SIRET is substituted, not left in clear", async () => {
    const vault: Record<string, string> = {};
    const r = await pseudonymize("SIRET 73282932000074 42 Avenue Noemie Moulin, 75008 Paris", {
      vault,
      numbers: false,
    });
    expect(r.text).not.toContain("Noemie");
    expect(r.text).not.toContain("Moulin");
    expect(Object.values(vault)).toContain("73282932000074"); // the SIRET on its own
  });

  it("still takes a real card, grouped or contiguous", async () => {
    for (const pan of ["4970 1012 3456 7893", "4970101234567893"]) {
      const vault: Record<string, string> = {};
      await pseudonymize(`Carte : ${pan}`, { vault, numbers: false });
      expect(Object.values(vault)).toContain(pan);
    }
  });

  it("a card beside another number is still masked, on either side", async () => {
    // After: the guard refuses the run, the prefix retry keeps the PAN and leaves « 42 ».
    const after = await pseudonymize("Paid with 4970101234567893 42 times", {
      vault: {},
      numbers: false,
    });
    expect(after.text).not.toContain("4970101234567893");
    expect(after.text).toContain(" 42 times");
    // Before: a guard on ANY group refused this run too, and with no suffix retry the PAN leaked.
    const before = await pseudonymize("Ref 42 4970101234567893", { vault: {}, numbers: false });
    expect(before.text).not.toContain("4970101234567893");
  });

  it("names the shape it refuses", () => {
    expect(isIdBesideNumber("73282932000074 42")).toBe(true);
    // A number BEFORE the PAN is not refused: no suffix retry exists, the PAN would leak.
    expect(isIdBesideNumber("12 4970101234567893")).toBe(false);
    expect(isIdBesideNumber("4970 1012 3456 7893")).toBe(false);
    expect(isIdBesideNumber("4970101234567893")).toBe(false);
  });
});
