import { describe, expect, it } from "vitest";
import type { McpTool } from "@openmasq/mcp";
import { fitToBudget } from "./toolCatalog";
import { DEFAULT_CATALOG_CONFIG, type CatalogConfig } from "./routingConfig";

const tool = (name: string, serverId: string, description = "", schema: unknown = {}): McpTool =>
  ({ name, serverId, description, inputSchema: schema }) as unknown as McpTool;

describe("fitToBudget — le repli déterministe quand le routeur échoue", () => {
  // Journal réel du 30/07/2026 : un échec du routeur (fournisseur en 503/400) fait
  // basculer sur ce repli. Pour un modèle à TRÈS grand contexte, 283 schémas complets
  // tenaient LARGEMENT sous le ratio de budget — rien n'était coupé (283/283 gardés,
  // 372k tokens montants pour une tâche qui n'en demandait qu'un). « Ça rentre » n'est
  // pas « c'est raisonnable » : `fitMaxTools` plafonne le NOMBRE, indépendamment du ratio.
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => tool(`srv__tool_${i}`, "srv", `Outil numéro ${i}.`));

  it("respecte le plafond de nombre même quand tout tiendrait dans le ratio (fenêtre géante)", () => {
    const huge = 10_000_000; // une fenêtre de contexte énorme — tout tiendrait sous le ratio
    const kept = fitToBudget(many(283), huge, DEFAULT_CATALOG_CONFIG);
    expect(kept.length).toBeLessThanOrEqual(DEFAULT_CATALOG_CONFIG.fitMaxTools);
  });

  it("garde tout quand le plafond de nombre est désactivé (Infinity) et que ça tient au ratio", () => {
    const cfg: CatalogConfig = { ...DEFAULT_CATALOG_CONFIG, fitMaxTools: Infinity };
    const huge = 10_000_000;
    const kept = fitToBudget(many(283), huge, cfg);
    expect(kept.length).toBe(283);
  });

  it("le ratio seul continue de couper même sous le plafond de nombre", () => {
    const cfg: CatalogConfig = { ...DEFAULT_CATALOG_CONFIG, fitMaxTools: 1000 };
    const tiny = 500; // fenêtre minuscule — le ratio doit couper avant le plafond de nombre
    const kept = fitToBudget(many(50), tiny, cfg);
    expect(kept.length).toBeLessThan(50);
  });
});
