import { describe, it, expect } from "vitest";
import { pseudonymize } from "../../index";
import type { Vault } from "../../types";

/* Le flag « à vérifier » (Detection.uncertain → RedactionMatch.uncertain).
 *
 * Trois invariants, dans l'ordre d'importance :
 *  1. FAIL CLOSED — un span douteux est redacted EXACTEMENT comme un span sûr. Le flag ne
 *     gouverne que l'affichage de l'audit avant envoi, jamais la substitution.
 *  2. CORROBORATION — le doute ne survit que « vu par une seule source faible » : toute
 *     autre source (champ étiqueté, gazetteer — même supprimé comme doublon —, forced)
 *     qui revendique la même entité efface le flag.
 *  3. Le flag TRAVERSE le pipeline : posé par le NER local, il ressort sur le
 *     RedactionMatch de la valeur (c'est ce que `detectPii` livre au composeur). */

describe("« à vérifier » — le doute traverse, la corroboration l'efface, rien ne fuit", () => {
  it("un span douteux est SUBSTITUÉ comme un span sûr, et son match porte le flag", async () => {
    const vault: Vault = {};
    const { text, matches } = await pseudonymize("Le rapport de Norvatek Industries est prêt.", {
      vault,
      detectLocal: async () => [{ value: "Norvatek Industries", category: "ORG", uncertain: true }],
    });
    // 1. Fail closed : la valeur réelle ne part JAMAIS, douteuse ou pas.
    expect(text).not.toContain("Norvatek");
    expect(Object.values(vault)).toContain("Norvatek Industries");
    // 3. Le flag ressort sur le match de la valeur.
    const m = matches.find((x) => x.value === "Norvatek Industries");
    expect(m?.uncertain).toBe(true);
  });

  it("un champ étiqueté qui revendique la même valeur efface le doute", async () => {
    const vault: Vault = {};
    const { matches } = await pseudonymize("Société : Norvatek Industries", {
      vault,
      detectLocal: async () => [{ value: "Norvatek Industries", category: "ORG", uncertain: true }],
    });
    const m = matches.find((x) => x.value === "Norvatek Industries");
    expect(m).toBeTruthy(); // toujours redacted…
    expect(m?.uncertain).toBeUndefined(); // …mais plus « à vérifier » : deux sources
  });

  it("le gazetteer corrobore MÊME quand sa détection est supprimée comme doublon", async () => {
    // « Clémence Charvoz » est une paire prénom+nom que le gazetteer voit ; comme le NER
    // revendique déjà le span, la détection gazetteer n'est pas POUSSÉE (anti-doublon) —
    // mais son vote doit quand même effacer le doute (vu ≠ poussé).
    const vault: Vault = {};
    const { matches } = await pseudonymize("Dossier suivi par Clémence Charvoz.", {
      vault,
      detectLocal: async () => [{ value: "Clémence Charvoz", category: "NAME", uncertain: true }],
    });
    const m = matches.find((x) => x.value === "Clémence Charvoz");
    expect(m).toBeTruthy();
    expect(m?.uncertain).toBeUndefined();
  });

  it("une détection NER sûre ne porte jamais le flag", async () => {
    const vault: Vault = {};
    const { matches } = await pseudonymize("Le rapport de Norvatek Industries est prêt.", {
      vault,
      detectLocal: async () => [{ value: "Norvatek Industries", category: "ORG" }],
    });
    const m = matches.find((x) => x.value === "Norvatek Industries");
    expect(m).toBeTruthy();
    expect(m?.uncertain).toBeUndefined();
  });
});
