/**
 * The FR catalogue's « modelCatalog » slice — the SOURCE language. Les fiches sont en deux
 * halves (`modelCatalogA`, `modelCatalogB`) to hold the 300-LOC cap; this file assembles
 * them and carries the capability chips.
 */
import type { Messages } from "../messages";
import { modelCatalogA } from "./modelCatalogA";
import { modelCatalogB } from "./modelCatalogB";

export const modelCatalog = {
  tags: {
    reasoning: "Raisonnement",
    code: "Code",
    vision: "Vision",
    fast: "Rapide",
    cheap: "Économique",
    oss: "Open source",
    long: "Long contexte",
    agent: "Agentique",
  },
  models: { ...modelCatalogA, ...modelCatalogB },
  fallback: {
    premium: { strengths: ["Modèle haut de gamme"], weaknesses: [], bestFor: "Tâches exigeantes" },
    light: { strengths: ["Rapide et économique"], weaknesses: [], bestFor: "Tâches courantes" },
    generic: { strengths: ["Modèle polyvalent"], weaknesses: [], bestFor: "Usage général" },
  },
} satisfies Messages["modelCatalog"];
