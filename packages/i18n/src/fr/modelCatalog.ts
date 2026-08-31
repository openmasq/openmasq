/**
 * Tranche « modelCatalog » du catalogue FR — la langue SOURCE. Les fiches sont en deux
 * moitiés (`modelCatalogA`, `modelCatalogB`) pour tenir le cap 300 LOC ; ce fichier les
 * assemble et porte les pastilles de capacité.
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
