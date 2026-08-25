import { describe, expect, it } from "vitest";
import type { McpTool } from "@openmasq/mcp";
import { rescueNamedConnectors, rescueScopedConnectors } from "./connectorRescue";

/** Real catalog ids on purpose (`findConnector` resolves against the real registry) —
 *  a made-up id would silently test the "unknown connector" path instead. */
const tool = (name: string): McpTool =>
  ({ name, description: `outil ${name}`, inputSchema: { type: "object", properties: {} }, serverId: "ipc" }) as McpTool;

const ALL = [
  ...Array.from({ length: 4 }, (_, i) => tool(`intercom__t${i}`)),
  ...Array.from({ length: 4 }, (_, i) => tool(`notion__t${i}`)),
  ...Array.from({ length: 4 }, (_, i) => tool(`gmail--a1b2__t${i}`)),
];
const WIN = 128_000;

describe("rescueNamedConnectors — le rattrapage du pick vide", () => {
  it("charge le connecteur NOMMÉ quand le pick est vide (le cas du journal du 06/08)", () => {
    const r = rescueNamedConnectors([], ALL, "Voice intercom : compare tous les tickets du trimestre 2", WIN);
    expect(r.rescued).toEqual([{ id: "intercom", added: 4 }]);
    expect(r.kept.map((t) => t.name)).toEqual(ALL.slice(0, 4).map((t) => t.name));
  });

  it("ne fait RIEN quand le routeur a retenu quelque chose — un routage réussi n'est jamais élargi", () => {
    const kept = [tool("notion__t0")];
    const r = rescueNamedConnectors(kept, ALL, "cherche intercom", WIN);
    expect(r.rescued).toEqual([]);
    expect(r.kept).toBe(kept);
  });

  it("un préfixe multi-compte (`gmail--a1b2`) se ramène à sa marque et se rattrape par elle", () => {
    const r = rescueNamedConnectors([], ALL, "regarde dans gmail les messages de la semaine", WIN);
    expect(r.rescued).toEqual([{ id: "gmail", added: 4 }]);
  });

  it("l'alias français suffit — « ma boîte mail » rattrape gmail sans nommer la marque", () => {
    const r = rescueNamedConnectors([], ALL, "fais le tri dans ma boîte mail", WIN);
    expect(r.rescued.map((x) => x.id)).toContain("gmail");
  });

  it("un mot CONTENANT la marque ne matche pas (« notionnel » n'est pas notion)", () => {
    const r = rescueNamedConnectors([], ALL, "un écart notionnel sur le contrat", WIN);
    expect(r.rescued).toEqual([]);
  });

  it("aucun connecteur nommé → rien, la boucle garde le chemin catalogue + load_tools", () => {
    expect(rescueNamedConnectors([], ALL, "compare les trimestres", WIN).rescued).toEqual([]);
    expect(rescueNamedConnectors([], ALL, "   ", WIN).rescued).toEqual([]);
  });

  it("respecte le plafond de budget : un connecteur qui ne rentre pas est sauté, pas tronqué", () => {
    // Une description énorme fait dépasser le plafond de 85 % d'une petite fenêtre.
    const fat = Array.from({ length: 4 }, (_, i) =>
      ({ ...tool(`intercom__t${i}`), description: "x".repeat(4000) }) as McpTool,
    );
    const r = rescueNamedConnectors([], fat, "intercom : mes tickets", 1000);
    expect(r.rescued).toEqual([]);
    expect(r.kept).toEqual([]);
  });
});

describe("rescueScopedConnectors — inchangé par le déménagement", () => {
  it("rattrape le scope déclaré même quand le pick n'est PAS vide", () => {
    const kept = [tool("notion__t0")];
    const r = rescueScopedConnectors(kept, ALL, ["intercom"], WIN);
    expect(r.rescued).toEqual([{ id: "intercom", added: 4 }]);
    expect(r.kept).toHaveLength(5);
  });

  it("scope vide → identité", () => {
    const kept = [tool("notion__t0")];
    expect(rescueScopedConnectors(kept, ALL, [], WIN).kept).toBe(kept);
  });
});
