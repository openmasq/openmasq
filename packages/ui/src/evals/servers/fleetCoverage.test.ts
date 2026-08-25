import { describe, expect, it } from "vitest";
import { MCP_CONNECTORS } from "@openmasq/catalog/mcp";
import { ALL_FLEET, directFixtureGaps } from "./index";

// LE test de couverture : chaque connecteur du CATALOGUE a son FakeServer dans la
// flotte d'eval — ajouter un connecteur au produit sans sa fixture d'éval casse ici,
// donc la couverture ne peut plus régresser en silence. (Un FakeServer couvre les
// outils CLÉS, pas nécessairement toute la surface — la parité fine par outil viendra
// des captures `tools/list` sur comptes réels.)

describe("couverture flotte d'eval ⇄ catalogue connecteurs", () => {
  it("chaque connecteur du catalogue a un FakeServer", () => {
    // `demo` : le broker de démonstration — pas une intégration produit à évaluer.
    const EXCLUDED = new Set(["demo"]);
    const fleet = new Set(ALL_FLEET.map((s) => s.id));
    const missing = MCP_CONNECTORS.map((c) => c.id).filter((id) => !fleet.has(id) && !EXCLUDED.has(id));
    expect(missing, `connecteurs sans fixture d'eval : ${missing.join(", ")}`).toEqual([]);
  });

  it("les ids de la flotte sont des connecteurs RÉELS du catalogue (sauf exceptions listées)", () => {
    // `hubspot` : dette historique du harnais (le CRM générique des premiers
    // scénarios) — les nouveaux scénarios CRM utilisent `attio`/`close` (catalogue).
    const KNOWN_EXTRAS = new Set(["hubspot"]);
    const catalog = new Set(MCP_CONNECTORS.map((c) => c.id));
    const rogue = ALL_FLEET.map((s) => s.id).filter((id) => !catalog.has(id) && !KNOWN_EXTRAS.has(id));
    expect(rogue, `ids de flotte inconnus du catalogue : ${rogue.join(", ")}`).toEqual([]);
  });

  it("tous les outils DIRECT ont leur fixture de résultat", () => {
    expect(directFixtureGaps()).toEqual([]);
  });

  it("la flotte n'a pas deux serveurs pour un même id", () => {
    const ids = ALL_FLEET.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
