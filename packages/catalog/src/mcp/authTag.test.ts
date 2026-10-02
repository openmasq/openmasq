import { describe, it, expect } from "vitest";
import { mcpAuthShape, mcpAuthTag } from "./authTag";
import { MCP_CONNECTORS, findConnector } from "./index";

/**
 * The auth chip is a PROMISE about what connecting will get you. These pin the cases where the
 * generic "1-clic, aucun secret à fournir" would overstate it.
 */
describe("mcpAuthTag — what the app's own client can actually do", () => {
  it("never promises a 1-clic to a connector that has no first-party client", () => {
    for (const c of MCP_CONNECTORS.filter((c) => c.byoOnly)) {
      const tag = mcpAuthTag(c);
      expect(tag.label, `${c.id} advertises a 1-clic it does not offer`).not.toMatch(/1-clic/i);
      expect(tag.title).toMatch(/vos propres clés|vos clés/i);
    }
  });

  it("a byoOnly connector requests no 1-clic scope (the chip and the scopes agree)", () => {
    for (const c of MCP_CONNECTORS.filter((c) => c.byoOnly)) {
      expect(c.scopes?.managed ?? [], `${c.id}`).toEqual([]);
    }
  });

  it("Google : « Bientôt disponible », clés seulement, tant que Google vérifie l'app", () => {
    for (const id of ["gmail", "google-drive", "google-calendar", "google-docs", "google-sheets", "google-tasks", "google-analytics"]) {
      const c = findConnector(id)!;
      expect(c.byoOnly, id).toBe(true);
      expect(mcpAuthShape(c).variant, id).toBe("comingSoon");
      expect(mcpAuthTag(c).label, id).toBe("Bientôt disponible");
      expect(c.scopes?.byo?.length, `${id} keeps its BYO scopes`).toBeGreaterThan(0);
    }
    // Restricted scopes = CASA; the rest = brand verification. Both are ours to clear.
    expect(findConnector("gmail")!.byoReason).toBe("casa");
    expect(findConnector("google-drive")!.byoReason).toBe("casa");
    expect(findConnector("google-sheets")!.byoReason).toBe("google-verification");
  });

  it("admin-consent n'est JAMAIS « bientôt » : ce n'est pas à nous de lever le blocage", () => {
    const shape = mcpAuthShape({ transport: "direct", byoOnly: true, byoReason: "admin-consent" });
    expect(shape.variant).toBe("byoOnly");
  });

  it("only a CASA connector may claim the integration is under way", () => {
    // `admin-consent` is NOT ours to fix — dressing it up as "en cours" would promise
    // a 1-clic that is never coming.
    for (const c of MCP_CONNECTORS.filter((c) => c.byoReason === "admin-consent")) {
      const { title } = mcpAuthTag(c);
      expect(title, `${c.id}`).not.toMatch(/en cours/i);
      expect(title).toMatch(/administrateur/i);
    }
  });

  it("speaks the user's language, not the protocol's", () => {
    // This copy is read by someone deciding whether to hand the app their mailbox. A
    // word they don't know can't inform that decision — and these all leaked in once.
    const JARGON =
      /OAuth|PKCE|loopback|CASA|DCR|Dynamic Client Registration|device flow|client public|token|broker|endpoint|scope/i;
    for (const c of MCP_CONNECTORS) {
      const { label, title } = mcpAuthTag(c);
      expect(title, `${c.id} title: ${title}`).not.toMatch(JARGON);
      expect(label, `${c.id} label: ${label}`).not.toMatch(JARGON);
    }
  });

  it("a reason and what-it-unlocks always travel together", () => {
    for (const c of MCP_CONNECTORS) {
      // A PARTIAL one-click must say what keys add; a keys-only one needs no such line.
      if (c.byoReason && !c.byoOnly) expect(c.byoAdds, `${c.id} has a reason but no byoAdds`).toBeTruthy();
      if (c.byoAdds || c.byoOnly) expect(c.byoReason, `${c.id} is BYO-gated but has no reason`).toBeTruthy();
    }
  });
});
