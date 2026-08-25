import { describe, it, expect } from "vitest";
import { pseudonymize, unredact } from "../../index";
import type { Vault } from "../../types";

/* Le gazetteer de prénoms est un filet de RAPPEL de dernier recours : il tourne en
 * DERNIER dans `gather`, et seulement sur les clés d'entité qu'aucune autre source ne
 * revendique. Sans cette règle, un span qu'une source sémantique possède déjà recevait
 * une SECONDE identité NAME (des alias par mot à côté du faux d'ORG) — l'entité se
 * scindait dans le coffre. */

describe("gather — le gazetteer ne double-revendique jamais un span possédé", () => {
  it("« Oscar Studio » ORG (NER) ne devient pas AUSSI une personne prénommée Oscar", async () => {
    // « oscar » est un prénom du lexique, donc le gazetteer voit une paire prénom+nom
    // sur le MÊME span que l'ORG du NER. Une seule identité doit sortir.
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
