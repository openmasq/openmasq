import { describe, expect, it } from "vitest";
import { MCP_CONNECTORS, connectorHosts, findConnector } from "./index";

/**
 * `McpConnector.hosts` is a security ALLOW-list, not display data: the sub-parts of a
 * link pointing to one of these domains stay IN CLEAR for the model (a redacted Notion
 * page id is a dead link the connector can no longer read back). A domain that is too
 * broad or malformed therefore silently widens a redaction exemption — hence these
 * invariants.
 */
describe("McpConnector.hosts", () => {
  const declared = MCP_CONNECTORS.flatMap((c) => (c.hosts ?? []).map((h) => [c.id, h] as const));

  it("n'est jamais une URL : un hôte nu, minuscule, sans point de tête", () => {
    for (const [id, h] of declared) {
      expect(`${id}: ${h}`).toBe(`${id}: ${h.toLowerCase()}`);
      expect(h).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
    }
  });

  // The suffix must TERMINATE the host (`app.notion.com` ends with `.notion.com`), so a
  // single-level domain would exempt an entire TLD, and a shared-platform domain would
  // exempt anyone else's resources.
  it("n'exempte jamais un suffixe public ni un TLD", () => {
    const TOO_BROAD = new Set(["com", "net", "org", "io", "co", "app", "dev", "ai", "sh", "cloud", "google.com", "microsoft.com", "live.com", "amazonaws.com", "github.io", "herokuapp.com"]);
    for (const [id, h] of declared) expect([id, TOO_BROAD.has(h)]).toEqual([id, false]);
  });

  // What these connectors return are THIRD-PARTY pages: exempting them
  // would amount to exempting any browsed URL, which the guard forbids.
  it("reste vide pour les connecteurs de recherche / crawl", () => {
    for (const id of ["exa", "tavily", "firecrawl", "apify", "brightdata"]) {
      expect([id, connectorHosts(findConnector(id))]).toEqual([id, []]);
    }
  });

  it("porte les domaines d'un service que l'utilisateur relie vraiment", () => {
    expect(connectorHosts(findConnector("notion"))).toContain("notion.com");
    expect(connectorHosts(findConnector("slack"))).toContain("slack.com");
    // Tolérant à un id d'INSTANCE multi-compte, comme `findConnector`.
    expect(connectorHosts(findConnector("notion--a1b2"))).toContain("notion.com");
  });

  // Fail closed: nothing known ⇒ no exemption.
  it("est vide pour un connecteur inconnu", () => {
    expect(connectorHosts(findConnector("nope"))).toEqual([]);
    expect(connectorHosts(undefined)).toEqual([]);
  });
});
