import { describe, expect, it } from "vitest";
import { MCP_CONNECTORS, connectorHosts, findConnector } from "./index";

/**
 * `McpConnector.hosts` est une ALLOW-list de sécurité, pas une donnée d'affichage : les
 * sous-parties d'un lien pointant vers l'un de ces domaines restent EN CLAIR pour le
 * modèle (un id de page Notion redacted est un lien mort que le connecteur ne sait plus
 * relire). Un domaine trop large ou mal formé élargit donc silencieusement une exemption
 * de redaction — d'où ces invariants.
 */
describe("McpConnector.hosts", () => {
  const declared = MCP_CONNECTORS.flatMap((c) => (c.hosts ?? []).map((h) => [c.id, h] as const));

  it("n'est jamais une URL : un hôte nu, minuscule, sans point de tête", () => {
    for (const [id, h] of declared) {
      expect(`${id}: ${h}`).toBe(`${id}: ${h.toLowerCase()}`);
      expect(h).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
    }
  });

  // Le suffixe doit TERMINER l'hôte (`app.notion.com` finit par `.notion.com`), donc un
  // domaine d'un seul cran exempterait tout un TLD, et un domaine de plateforme partagée
  // exempterait les ressources de n'importe qui d'autre.
  it("n'exempte jamais un suffixe public ni un TLD", () => {
    const TOO_BROAD = new Set(["com", "net", "org", "io", "co", "app", "dev", "ai", "sh", "cloud", "google.com", "microsoft.com", "live.com", "amazonaws.com", "github.io", "herokuapp.com"]);
    for (const [id, h] of declared) expect([id, TOO_BROAD.has(h)]).toEqual([id, false]);
  });

  // Ce que ces connecteurs renvoient, ce sont des pages TIERCES : les exempter
  // reviendrait à exempter n'importe quelle URL parcourue, ce que la garde interdit.
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

  // Fail closed : rien de connu ⇒ aucune exemption.
  it("est vide pour un connecteur inconnu", () => {
    expect(connectorHosts(findConnector("nope"))).toEqual([]);
    expect(connectorHosts(undefined)).toEqual([]);
  });
});
