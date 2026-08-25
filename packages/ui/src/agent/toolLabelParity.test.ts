import { describe, expect, it } from "vitest";
import { humanToolLabel, INTERCEPTED } from "./humanToolLabel";
import { toolActionLabel, toolStartNarration } from "./toolActionLabel";
import { isWriteTool } from "./mcpAgentClassify";

/**
 * TROIS surfaces nomment le même appel — le chargeur pendant l'action
 * (`toolActionLabel`), la narration posée au moment du dispatch (`toolStartNarration`)
 * et la ligne de trace persistée (`humanToolLabel`). Rien ne les tenait ensemble : un
 * commentaire affirmait que la table unique l'empêchait, et l'exception `run_python`
 * juste en dessous le démentait. Un commentaire ne fait pas échouer la CI ; ce fichier si.
 *
 * Deux propriétés, et la seconde est une question d'honnêteté, pas de style :
 *  1. un outil INTERCEPTÉ porte le même nom partout ;
 *  2. le vocabulaire « amusant » par connecteur ne peut habiller qu'une LECTURE — il est
 *     entièrement fait de verbes de lecture (fouille, farfouille, feuilletage…), et il
 *     s'affichait pendant un envoi de mail ou une suppression de fichier.
 */

/** Le libellé nu, sans les « … » ni la taille d'argument que le chargeur ajoute. */
const nu = (s: string | undefined) => (s ?? "").replace(/….*$/, "");

describe("un outil intercepté porte le MÊME nom sur les trois surfaces", () => {
  for (const [tool, attendu] of Object.entries(INTERCEPTED)) {
    it(`${tool} → « ${attendu} »`, () => {
      expect(nu(toolActionLabel(tool))).toBe(attendu);
      expect(toolStartNarration(tool, "")).toBe(attendu);
    });
  }
});

describe("le vocabulaire amusant n'habille jamais une écriture", () => {
  // Un appel d'écriture par connecteur « amusant » couvert, tel qu'il arrive vraiment.
  const ecritures = [
    "gmail__send_email",
    "microsoft-outlook__send_email",
    "slack__send_message",
    "notion__notion-create-pages",
    "linear__create_issue",
    "google-drive__delete_file",
    "google-docs__update_document",
    "stripe__stripe_api_write",
    "canva__create_design",
  ];

  for (const plein of ecritures) {
    const [connecteur, outil] = plein.split("__");
    it(`${plein} : le chargeur annonce l'action, pas une fouille`, () => {
      const direct = nu(toolActionLabel(plein));
      const trace = humanToolLabel(connecteur, outil);
      // C'est bien une écriture selon la SEULE définition qui compte (celle du gate).
      expect(isWriteTool(outil), `${outil} devrait être classé écriture`).toBe(true);
      // …donc le chargeur porte le verbe de la trace, jamais la phrase de lecture.
      expect(direct, `« ${direct} » pendant ${plein}`).toContain(trace);
      expect(toolStartNarration(outil, connecteur)).toBe(trace);
    });
  }

  it("une LECTURE garde bien sa phrase contextuelle (on ne casse pas le ton)", () => {
    expect(nu(toolActionLabel("gmail__search_messages"))).toBe("Fouille de la boîte mail");
    expect(nu(toolActionLabel("notion__notion-fetch"))).toBe("Feuilletage de Notion");
    expect(toolStartNarration("search_messages", "gmail")).toBe("Fouille de la boîte mail");
  });
});
