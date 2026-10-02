import { describe, expect, it } from "vitest";
import { pseudonymize } from "../../index";
import { detectPhones } from "./index";

/** The national forms that need no phone word: the word gate missed every number of a CV's
 *  contact line, a letter's signature block, a sentence cut by « ; ». */
describe("detectPhones — GB and parenthesised US numbers without a phone word", () => {
  const found = (t: string) => detectPhones(t).map((p) => p.value);

  it.each([
    ["just ring 07851 264309 when you arrive", "07851 264309"],
    ["HR at people@example.co.uk or 0117 496 0732.", "0117 496 0732"],
    ["Rosie – 01242 518637 or rosie@example.co.uk", "01242 518637"],
    ["London office 020 7946 0518", "020 7946 0518"],
    ["Manchester M14 6RQ · 07946 318725 · e@example.uk", "07946 318725"],
    ["Employee contact: 509 Larkspur Way; (614) 555-0193.", "(614) 555-0193"],
    ["Rebecca Ostrowski-Chen\n(212) 555-0167", "(212) 555-0167"],
  ])("%s", (text, number) => {
    expect(found(text)).toContain(number);
  });

  it.each([
    "Part no. 614-555-0193 in stock", // dashed 3-3-4 without a word: a part number
    "Order (614) 111-0193", // an exchange the plan never assigns
    "Invoice 0117 4960 732", // not a British grouping
    "Account 07851264309", // contiguous: no grouping to vouch for it
    "SIRET 732 829 320 00074",
  ])("leaves %s alone", (text) => {
    expect(found(text)).toEqual([]);
  });

  it("an abbreviation's dot does not cut the phone word off its number", () => {
    expect(found("Plaintiff: R. Subramaniam, tel. 301.555.0163")).toEqual(["301.555.0163"]);
    expect(found("Order no. 301.555.0163 shipped")).toEqual([]);
  });

  it("the number leaves the outgoing text", async () => {
    const r = await pseudonymize("Questions to HR at people@example.co.uk or 0117 496 0732.", {
      vault: {},
      numbers: false,
    });
    expect(r.text).not.toContain("0117 496 0732");
  });
});
