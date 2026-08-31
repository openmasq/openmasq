import { describe, it, expect } from "vitest";
import { pseudonymize, unredact } from "../../index";
import type { Vault } from "../../types";

/* The first-name gazetteer is a last-resort RECALL net: it runs
 * LAST in `gather`, and only on entity keys no other source
 * claims. Without this rule, a span a semantic source already owned would receive
 * a SECOND NAME identity (per-word aliases alongside the ORG fake) — the entity
 * split in the vault. */

describe("gather — le gazetteer ne double-revendique jamais un span possédé", () => {
  it("« Oscar Studio » ORG (NER) ne devient pas AUSSI une personne prénommée Oscar", async () => {
    // « oscar » is a lexicon first name, so the gazetteer sees a first+last name pair
    // on the SAME span as the NER's ORG. Only one identity must come out.
    const vault: Vault = {};
    const { text } = await pseudonymize("Oscar Studio livre le lot.", {
      vault,
      detectLocal: async () => [{ value: "Oscar Studio", category: "ORG" }],
    });
    const norm = (s: string) => s.toLowerCase().replace(/[\s._-]+/g, "");
    expect(new Set(Object.keys(vault).map(norm)).size).toBe(1);
    expect(unredact(text, vault)).toBe("Oscar Studio livre le lot.");
  });
});
