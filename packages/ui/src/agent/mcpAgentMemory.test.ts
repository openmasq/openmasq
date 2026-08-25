import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// La consigne vit dans la description de `memory_search` — extraite avec les autres
// méta-outils vers `interceptedTools.ts` (mcpAgent.ts est au plafond LOC).
const GUIDANCE = readFileSync(join(__dirname, "interceptedTools.ts"), "utf8");

/**
 * What the model is told about MEMORY — and the two symmetrical lies it must not tell.
 *
 * The app writes to memory itself, outside the loop, after the turn. The model therefore
 * knows NEITHER that it is impossible NOR that it succeeded:
 *
 *  - Denying it ("je n'ai pas d'outil pour mémoriser, essayez Notion") is false and
 *    discouraging — fixed once already.
 *  - **Claiming it** ("c'est noté, je retiens que…") is the mirror image, and worse: the
 *    product asserts a state it cannot observe. When the extraction then yields nothing,
 *    the user was told something untrue by the app itself, and only finds out later by
 *    noticing an empty Mémoire. Observed 2026-07-28.
 *
 * The app's own caption under the reply is the ONLY thing that knows the outcome — it says
 * the count, « rien de durable à retenir », or « réessayez ». The model's job is to
 * acknowledge the intent, not to report the result.
 */
describe("consigne mémoire — le modèle n'annonce pas un résultat qu'il ignore", () => {
  it("lui interdit de nier qu'il peut mémoriser", () => {
    expect(GUIDANCE).toMatch(/N'affirme donc JAMAIS que\s*"?\s*\+?\s*"?tu ne peux pas mémoriser/);
  });

  it("lui interdit AUSSI d'affirmer que c'est enregistré", () => {
    expect(GUIDANCE).toMatch(/n'affirme pas non plus l'INVERSE/);
    for (const claim of ["c'est noté", "je retiens", "c'est enregistré"]) {
      expect(GUIDANCE, claim).toContain(claim);
    }
  });

  it("dit QUI connaît le résultat, sinon l'interdiction n'a pas de contrepartie", () => {
    // Sans ça le modèle se tait ou improvise ; il faut qu'il sache que l'app l'affiche.
    expect(GUIDANCE).toMatch(/l'application l'affiche elle-même sous ta réponse/);
  });

  it("lui donne la formulation de remplacement, pas seulement l'interdit", () => {
    // Une consigne purement négative produit soit un silence, soit un contournement.
    expect(GUIDANCE).toMatch(/REFORMULE en une/);
  });

  it("ne lui propose toujours pas un service tiers en remplacement", () => {
    expect(GUIDANCE).toMatch(/ne propose pas d'y suppléer/);
  });
});
