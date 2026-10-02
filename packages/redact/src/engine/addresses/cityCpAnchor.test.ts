import { describe, expect, it } from "vitest";
import { pseudonymize } from "../../index";
import { detectAddresses } from "./index";

/** « City (CP) » after the preposition « à »: the preposition is a WORD, the code ends on a
 *  digit boundary. « Elena Varga (SBN 301884) » produced the place « Varga (SBN 30188 ». */
describe("the notarial « à CITY (CP) » place", () => {
  const places = (t: string) =>
    detectAddresses(t)
      .filter((d) => d.category === "PLACE")
      .map((d) => d.value);

  it.each([
    "Elena Varga (SBN 301884)",
    "Attorney Elena Varga (Bar 301884) for plaintiff",
    "Maria ROSSI (12345)",
  ])("no place in %s", (text) => {
    expect(places(text)).toEqual([]);
  });

  it.each([
    ["demeurant à ASNIÈRES-SUR-SEINE (92600)", "ASNIÈRES-SUR-SEINE (92600)"],
    ["Né à FLERS (15000) le 7 mars 1991", "FLERS (15000)"],
    ["demeurant a BAYEUX (63130), architecte", "BAYEUX (63130)"],
    ["Siège : BORDEAUX (33000)", "BORDEAUX (33000)"],
    ["Néà CONDOM (79000) le17 mars 1993.", "CONDOM (79000)"], // OCR-glued « à »
  ])("still finds %s", (text, place) => {
    expect(places(text)).toContain(place);
  });

  it("the bar number is not cut in two in the outgoing text", async () => {
    const vault: Record<string, string> = {};
    await pseudonymize("Elena Varga (SBN 301884)", { vault, numbers: false });
    expect(Object.values(vault).some((v) => v.includes("30188") && !v.includes("301884"))).toBe(
      false,
    );
  });
});
