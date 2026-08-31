import { describe, it, expect } from "vitest";
import { pseudonymize } from "../../index";
import type { Vault } from "../../types";

/* The « to verify » flag (Detection.uncertain → RedactionMatch.uncertain).
 *
 * Three invariants, in order of importance:
 *  1. FAIL CLOSED — a doubtful span is redacted EXACTLY like a certain span. The flag only
 *     governs the pre-send audit display, never the substitution.
 *  2. CORROBORATION — doubt survives only « seen by a single weak source »: any
 *     other source (labeled field, gazetteer — even dropped as a duplicate —, forced)
 *     that claims the same entity clears the flag.
 *  3. The flag TRAVELS through the pipeline: set by the local NER, it comes back out on the
 *     value's RedactionMatch (that's what `detectPii` delivers to the composer). */

describe("« à vérifier » — le doute traverse, la corroboration l'efface, rien ne fuit", () => {
  it("un span douteux est SUBSTITUÉ comme un span sûr, et son match porte le flag", async () => {
    const vault: Vault = {};
    const { text, matches } = await pseudonymize("Le rapport de Norvatek Industries est prêt.", {
      vault,
      detectLocal: async () => [{ value: "Norvatek Industries", category: "ORG", uncertain: true }],
    });
    // 1. Fail closed: the real value NEVER leaves, doubtful or not.
    expect(text).not.toContain("Norvatek");
    expect(Object.values(vault)).toContain("Norvatek Industries");
    // 3. The flag comes back out on the value's match.
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
    expect(m).toBeTruthy(); // still redacted…
    expect(m?.uncertain).toBeUndefined(); // …but no longer « to verify »: two sources
  });

  it("le gazetteer corrobore MÊME quand sa détection est supprimée comme doublon", async () => {
    // « Clémence Charvoz » is a first+last name pair the gazetteer sees; since the NER
    // already claims the span, the gazetteer detection is NOT PUSHED (anti-duplicate) —
    // but its vote must still clear the doubt (seen ≠ pushed).
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
