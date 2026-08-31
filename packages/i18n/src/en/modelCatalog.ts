/**
 * Tranche « modelCatalog » du catalogue EN — traduit de la source (`../fr/modelCatalog.ts`).
 */
import type { Messages } from "../messages";
import { modelCatalogA } from "./modelCatalogA";
import { modelCatalogB } from "./modelCatalogB";

export const modelCatalog = {
  tags: {
    reasoning: "Reasoning",
    code: "Code",
    vision: "Vision",
    fast: "Fast",
    cheap: "Budget",
    oss: "Open source",
    long: "Long context",
    agent: "Agentic",
  },
  models: { ...modelCatalogA, ...modelCatalogB },
  fallback: {
    premium: { strengths: ["High-end model"], weaknesses: [], bestFor: "Demanding tasks" },
    light: { strengths: ["Fast and inexpensive"], weaknesses: [], bestFor: "Everyday tasks" },
    generic: { strengths: ["All-round model"], weaknesses: [], bestFor: "General use" },
  },
} satisfies Messages["modelCatalog"];
