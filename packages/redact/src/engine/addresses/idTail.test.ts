import { describe, expect, it } from "vitest";
import { detectAddresses } from ".";

// A SIRET's last group is 5 digits: read as « CP Ville », the word after it (« Code NAF »)
// was faked as a city. The id is masked whole by its own rule; the tail is never a postcode.
describe("a 5-digit group closing a SIRET is never a postal code", () => {
  const places = (t: string) =>
    detectAddresses(t)
      .filter((d) => d.category === "PLACE" || d.category === "POSTAL_CODE")
      .map((d) => d.value);

  it("refuses the SIRET tail, gutter or single space", () => {
    expect(places("Siret : 732 829 320 00074   Code NAF : 6201Z")).toEqual([]);
    expect(places("SIRET 732.829.320.00074 Paris")).toEqual([]);
  });

  it("still reads a real « CP Ville »", () => {
    const any = (t: string) => detectAddresses(t).some((d) => d.value.includes("75012"));
    expect(any("Facturation : 75012 Paris")).toBe(true);
    expect(any("BP 1234 75012 PARIS")).toBe(true);
  });
});
