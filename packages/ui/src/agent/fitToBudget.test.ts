import { describe, expect, it } from "vitest";
import type { McpTool } from "@openmasq/mcp";
import { fitToBudget } from "./toolCatalog";
import { DEFAULT_CATALOG_CONFIG, type CatalogConfig } from "./routingConfig";

const tool = (name: string, serverId: string, description = "", schema: unknown = {}): McpTool =>
  ({ name, serverId, description, inputSchema: schema }) as unknown as McpTool;

describe("fitToBudget — le repli déterministe quand le routeur échoue", () => {
  // Real journal from 30/07/2026: a router failure (provider on 503/400) falls
  // back to this fallback. For a model with a VERY large context, 283 full schemas
  // fit WELL under the budget ratio — nothing was cut (283/283 kept,
  // 372k tokens climbing for a task that only needed one). « It fits » is NOT
  // « it's reasonable »: `fitMaxTools` caps the COUNT, independently of the ratio.
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => tool(`srv__tool_${i}`, "srv", `Outil numéro ${i}.`));

  it("respecte le plafond de nombre même quand tout tiendrait dans le ratio (fenêtre géante)", () => {
    const huge = 10_000_000; // a huge context window — everything would fit under the ratio
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
    const tiny = 500; // tiny window — the ratio must cut before the count cap
    const kept = fitToBudget(many(50), tiny, cfg);
    expect(kept.length).toBeLessThan(50);
  });
});
