import { describe, it, expect } from "vitest";
import { findConnector } from "@openmasq/catalog/mcp";
import { pickStarters, INTEGRATION_STARTERS, UNIVERSAL_STARTERS, STARTER_COUNT } from "./starters";

describe("pickStarters — deux rangées", () => {
  it("une install FRAÎCHE garde ses quatre exemples universels", () => {
    const { universal } = pickStarters([]);
    expect(universal.map((s) => s.id)).toEqual(UNIVERSAL_STARTERS.map((s) => s.id));
    expect(universal.every((s) => s.connectorId === undefined)).toBe(true);
  });

  it("sans aucun connecteur, la seconde rangée n'est faite que d'OFFRES", () => {
    // La régression que ce module existe pour empêcher : une carte d'intégration qui
    // porterait un PROMPT sur une install où rien n'est branché ne pourrait qu'échouer.
    // Elle propose de connecter — `connected:false` — et ne promet donc rien.
    const { integrations } = pickStarters([]);
    expect(integrations.length).toBeGreaterThan(0);
    expect(integrations.every((s) => s.connected === false)).toBe(true);
    expect(integrations.every((s) => !!s.connectorId)).toBe(true);
  });

  it("un service connecté passe DEVANT les offres", () => {
    const { integrations } = pickStarters(["gmail"]);
    expect(integrations[0].connectorId).toBe("gmail");
    expect(integrations[0].connected).toBe(true);
    expect(integrations.slice(1).every((s) => s.connected === false)).toBe(true);
  });

  it("nomme le service RÉELLEMENT connecté, pas le premier de la liste", () => {
    // Même métier, autre fournisseur : quelqu'un sur Outlook ne doit jamais voir Gmail.
    expect(pickStarters(["microsoft-outlook"]).integrations[0].connectorId).toBe(
      "microsoft-outlook",
    );
  });

  it("ne présente jamais une carte CONNECTÉE dont le service est absent", () => {
    for (const connected of [[], ["gmail"], ["slack", "github"], ["filesystem"]])
      for (const s of pickStarters(connected).integrations)
        if (s.connected) expect(connected).toContain(s.connectorId);
  });

  it("chaque rangée est plafonnée à quatre", () => {
    const all = INTEGRATION_STARTERS.flatMap((s) => (s.need.kind === "connector" ? s.need.ids : []));
    const { universal, integrations } = pickStarters(all);
    expect(universal).toHaveLength(STARTER_COUNT);
    expect(integrations).toHaveLength(STARTER_COUNT);
    expect(integrations.every((s) => s.connected)).toBe(true);
  });

  it("un service ne remplit jamais deux cases — offres comprises", () => {
    // Outlook sert le mail ET l'agenda. Deux cartes au même logo se lisent comme un bug
    // et dépensent la moitié de la rangée sur un seul service.
    for (const connected of [[], ["microsoft-outlook"], ["gmail", "microsoft-outlook"]]) {
      const ids = pickStarters(connected).integrations.map((s) => s.connectorId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("catalogue des amorces", () => {
  it("chaque amorce d'intégration nomme des connecteurs RÉELS du catalogue", () => {
    // Une coquille est silencieuse : la carte n'apparaîtrait jamais, pour personne.
    for (const s of INTEGRATION_STARTERS) {
      if (s.need.kind !== "connector") continue;
      for (const id of s.need.ids)
        expect(findConnector(id), `\`${id}\` ne correspond à aucun connecteur`).toBeTruthy();
    }
  });

  it("assez d'amorces universelles pour remplir la rangée à elles seules", () => {
    expect(UNIVERSAL_STARTERS.length).toBeGreaterThanOrEqual(STARTER_COUNT);
  });

  it("des ids stables et uniques (clés React et table d'icônes)", () => {
    const ids = [...INTEGRATION_STARTERS, ...UNIVERSAL_STARTERS].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
