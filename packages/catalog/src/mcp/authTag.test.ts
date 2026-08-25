import { describe, it, expect } from "vitest";
import { mcpAuthTag } from "./authTag";
import { MCP_CONNECTORS, findConnector } from "./index";

/**
 * The auth chip is a PROMISE about what connecting will get you, on the two surfaces
 * that show it (desktop Settings + the admin console). These pin the cases where the
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

  it("Gmail : le 1-clic est PLEIN depuis le 30/07/2026 (lecture + envoi, plus de « limité »)", () => {
    const gmail = findConnector("gmail")!;
    const tag = mcpAuthTag(gmail);
    expect(gmail.byoOnly).toBeFalsy();
    expect(gmail.byoAdds).toBeUndefined(); // rien que le byo ajoute → pas de chip « limité »
    expect(tag.label).toBe("1-clic");
    expect(tag.title).not.toMatch(/vos propres clés/i);
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
      if (c.byoReason) expect(c.byoAdds, `${c.id} has a reason but no byoAdds`).toBeTruthy();
      if (c.byoAdds) expect(c.byoReason, `${c.id} has byoAdds but no reason`).toBeTruthy();
    }
  });

  it("an unrestricted direct connector keeps the plain 1-clic blurb", () => {
    // 30/07/2026 : managed ≡ byo sur les connecteurs Google (capacités 1-clic 100 %).
    const cal = findConnector("google-calendar")!;
    expect(cal.scopes?.byo).toEqual(cal.scopes?.managed);
    const tag = mcpAuthTag(cal);
    expect(tag.label).toBe("1-clic");
    expect(tag.title).not.toMatch(/CASA/);
  });
});
