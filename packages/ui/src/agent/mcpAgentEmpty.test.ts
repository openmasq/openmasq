import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const GUIDANCE = readFileSync(join(__dirname, "mcpAgentGuidance.ts"), "utf8");

/**
 * Two failures observed together on « fais de la veille sur les fournisseurs de X »
 * (2026-07-28), and they share one root: the model would rather produce something than
 * admit it has nothing.
 *
 *  1. The web returned nothing about a small private company — reasonable — and the answer
 *     became three sections, one of which read « l'absence d'actualités suggère une
 *     stabilité dans la chaîne d'approvisionnement ». That is a conclusion drawn from
 *     NOTHING, presented as a finding. It is the dressed-up answer the product forbids
 *     everywhere else: a real dead end is stated, not decorated.
 *  2. The company's memory card WAS injected (the reply carried « Mémoire utilisée »), and
 *     the model still answered as though it knew nothing about the entity.
 *
 * Guidance is prose, so what can be pinned is that the prose still SAYS these things —
 * enough to catch a future edit quietly dropping them.
 */
describe("consigne — ne pas habiller le vide", () => {
  it("dit qu'un résultat vide se dit en une phrase", () => {
    expect(GUIDANCE).toMatch(/RIEN TROUVÉ se dit en une phrase/);
  });

  it("interdit de CONCLURE à partir d'une absence", () => {
    // Le cœur du défaut : « rien trouvé » n'est pas une donnée sur l'entreprise.
    expect(GUIDANCE).toMatch(/ne tire AUCUNE conclusion de l'absence/);
  });

  it("interdit le remplissage en sections vides", () => {
    expect(GUIDANCE).toMatch(/ne remplis pas la réponse de sections vides/);
  });

  it("propose une sortie, plutôt qu'un simple interdit", () => {
    // Une consigne purement négative laisse le modèle sans conduite de remplacement.
    expect(GUIDANCE).toMatch(/Propose plutôt ce qui débloquerait/);
  });
});

describe("consigne — la mémoire injectée fait partie de la réponse", () => {
  it("demande de s'en servir pour cadrer la recherche", () => {
    expect(GUIDANCE).toMatch(/sers-t'en pour cadrer la recherche/);
  });

  it("interdit de répondre comme si l'entité était inconnue", () => {
    expect(GUIDANCE).toMatch(/ne réponds jamais comme si tu ne savais rien d'une entité/);
  });
});
