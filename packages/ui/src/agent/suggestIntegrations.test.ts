import { describe, it, expect } from "vitest";
import { MCP_CONNECTORS, findConnector } from "@openmasq/catalog/mcp";
import {
  connectedConnectorIds,
  connectorIdsFromTools,
  notConnectedConnectors,
  validateSuggestions,
  suggestGuidance,
  suggestIntegrationsDef,
  MAX_SUGGESTIONS,
} from "./suggestIntegrations";

// A couple of real catalog ids we can rely on existing.
const hasGmail = MCP_CONNECTORS.some((c) => c.id === "gmail");
const hasNotion = MCP_CONNECTORS.some((c) => c.id === "notion");

describe("connectedConnectorIds", () => {
  it("maps multi-account instance ids back to the connector", () => {
    const set = connectedConnectorIds(["gmail--a1b2", "notion", "webflow__list"]);
    expect(set.has("gmail")).toBe(true);
    expect(set.has("notion")).toBe(true);
  });
});

describe("connectorIdsFromTools", () => {
  it("reads the connector from the tool NAME even when serverId is the connection id ('ipc')", () => {
    // The loop's RedactingMcpClient rewrites EVERY tool's serverId to its single
    // connection id — keyed on serverId, the connected set was {ipc} and a
    // freshly-connected connector (Stripe) kept being re-suggested until the
    // conversation was reloaded. The NAME prefix is the reliable source.
    const set = connectorIdsFromTools([
      { name: "stripe__list_payments", serverId: "ipc" },
      { name: "gmail--a1b2__send_email", serverId: "ipc" },
    ]);
    expect(set.has("stripe")).toBe(true);
    expect(set.has("gmail")).toBe(true);
    // …and the candidates derived from it no longer contain the connected connector.
    const candidates = notConnectedConnectors(set);
    expect(candidates.some((c) => c.id === "stripe")).toBe(false);
    expect(candidates.some((c) => c.id === "gmail")).toBe(false);
  });

  it("still honours serverId for hosts with one connection per connector", () => {
    const set = connectorIdsFromTools([{ name: "list_payments", serverId: "stripe" }]);
    expect(set.has("stripe")).toBe(true);
  });
});

describe("notConnectedConnectors", () => {
  it("excludes connected connectors and the broker/demo placeholders", () => {
    const candidates = notConnectedConnectors(new Set(["gmail"]));
    expect(candidates.some((c) => c.id === "gmail")).toBe(false);
    expect(candidates.some((c) => c.id === "demo")).toBe(false);
    expect(candidates.every((c) => c.transport !== "broker")).toBe(true);
    // Something else should still be suggestable.
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("drops search connectors (Tavily/Exa/Firecrawl) when the browser is connected", () => {
    const isSearch = (id: string) => (c: { id: string }) => c.id === id;
    // Without the browser, search connectors ARE suggestable.
    const withoutBrowser = notConnectedConnectors(new Set());
    expect(withoutBrowser.some(isSearch("tavily"))).toBe(true);
    expect(withoutBrowser.some(isSearch("exa"))).toBe(true);
    // With the browser connected, they're dropped (the browser already searches the web).
    const withBrowser = notConnectedConnectors(new Set(), { connected: true });
    expect(withBrowser.some(isSearch("tavily"))).toBe(false);
    expect(withBrowser.some(isSearch("exa"))).toBe(false);
    expect(withBrowser.some(isSearch("firecrawl"))).toBe(false);
    expect(withBrowser.every((c) => c.category !== "search")).toBe(true);
    // Non-search connectors (e.g. Gmail) are unaffected.
    expect(withBrowser.some(isSearch("gmail"))).toBe(true);
  });

  // The reported bug: the browser was the ONE integration that could never be
  // suggested as a card (it isn't in the catalog's connectable transports), so the
  // model could only tell the user in prose to go find it in Réglages.
  it("suggests the browser when the host can enable it and it isn't connected", () => {
    const hasBrowser = (cs: { id: string }[]) => cs.some((c) => c.id === "browser");
    expect(hasBrowser(notConnectedConnectors(new Set(), { enableable: true }))).toBe(true);
    // Already on → nothing to propose (and it stays out even if enableable).
    expect(hasBrowser(notConnectedConnectors(new Set(), { connected: true, enableable: true }))).toBe(false);
    // Host can't enable it (web preview / mobile) → never offer a dead card.
    expect(hasBrowser(notConnectedConnectors(new Set(), { enableable: false }))).toBe(false);
    expect(hasBrowser(notConnectedConnectors(new Set()))).toBe(false);
  });

  it("offers the browser INSTEAD of the paid search connectors", () => {
    const candidates = notConnectedConnectors(new Set(), { enableable: true });
    expect(candidates.some((c) => c.id === "browser")).toBe(true);
    expect(candidates.every((c) => c.category !== "search")).toBe(true);
  });

  it("makes a suggested browser id survive validation and render (catalog-resolvable)", () => {
    const candidates = notConnectedConnectors(new Set(), { enableable: true });
    expect(validateSuggestions(["browser"], candidates)).toEqual(["browser"]);
    // IntegrationSuggestions renders via findConnector — an unresolvable id is dropped.
    const c = findConnector("browser");
    expect(c?.name).toBe("Navigateur");
    expect(c?.transport).toBe("builtin");
    // …and it must NOT be renderable as a card where the host can't enable it.
    expect(validateSuggestions(["browser"], notConnectedConnectors(new Set()))).toEqual([]);
  });
});

describe("validateSuggestions", () => {
  const candidates = notConnectedConnectors(new Set());

  it("keeps only known, not-connected ids, de-duped and capped", () => {
    const out = validateSuggestions(
      ["notion", "notion", "gmail--x1", "__nope__", 42, "webflow"],
      candidates,
    );
    // known ids kept once; unknown dropped; instance id resolved.
    if (hasNotion) expect(out).toContain("notion");
    expect(out.filter((id) => id === "notion").length).toBeLessThanOrEqual(1);
    expect(out).not.toContain("__nope__");
    expect(out.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
  });

  it("drops an already-connected id (not in candidates)", () => {
    const noGmail = notConnectedConnectors(new Set(["gmail"]));
    expect(validateSuggestions(["gmail"], noGmail)).toEqual([]);
  });

  it("handles non-array / empty input gracefully", () => {
    expect(validateSuggestions(undefined, candidates)).toEqual([]);
    expect(validateSuggestions("gmail", candidates)).toEqual([]);
    expect(validateSuggestions([], candidates)).toEqual([]);
  });
});

describe("suggestGuidance", () => {
  it("is empty with no candidates, else lists ids", () => {
    expect(suggestGuidance([])).toBe("");
    const g = suggestGuidance(notConnectedConnectors(new Set()));
    expect(g).toContain("suggest_integrations");
    if (hasGmail) expect(g).toContain("gmail");
  });
});

describe("suggestIntegrationsDef", () => {
  it("restricts integration_ids to the candidate ids via an enum", () => {
    const candidates = notConnectedConnectors(new Set());
    const def = suggestIntegrationsDef(candidates);
    expect(def.name).toBe("suggest_integrations");
    const props = def.parameters as {
      properties: { integration_ids: { items: { enum: string[] } } };
      required: string[];
    };
    expect(props.required).toContain("integration_ids");
    const en = props.properties.integration_ids.items.enum;
    expect(en).toEqual(candidates.map((c) => c.id));
    expect(en).not.toContain("gmail-not-a-real-id");
  });
});
