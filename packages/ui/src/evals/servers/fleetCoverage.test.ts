import { describe, expect, it } from "vitest";
import { MCP_CONNECTORS } from "@openmasq/catalog/mcp";
import { ALL_FLEET, directFixtureGaps } from "./index";

// THE coverage test: every connector in the CATALOG has its FakeServer in the
// eval fleet — adding a connector to the product without its eval fixture breaks here,
// so coverage can no longer regress silently. (A FakeServer covers the
// KEY tools, not necessarily the whole surface — fine-grained per-tool parity will come
// from `tools/list` captures on real accounts.)

describe("couverture flotte d'eval ⇄ catalogue connecteurs", () => {
  it("chaque connecteur du catalogue a un FakeServer", () => {
    // `demo`: the demo broker — not a product integration to evaluate.
    const EXCLUDED = new Set(["demo"]);
    const fleet = new Set(ALL_FLEET.map((s) => s.id));
    const missing = MCP_CONNECTORS.map((c) => c.id).filter((id) => !fleet.has(id) && !EXCLUDED.has(id));
    expect(missing, `connecteurs sans fixture d'eval : ${missing.join(", ")}`).toEqual([]);
  });

  it("les ids de la flotte sont des connecteurs RÉELS du catalogue (sauf exceptions listées)", () => {
    // `hubspot`: historical debt from the harness (the generic CRM from the early
    // scenarios) — new CRM scenarios use `attio`/`close` (catalog).
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
