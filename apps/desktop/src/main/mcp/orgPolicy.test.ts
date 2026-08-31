import { afterEach, describe, expect, it } from "vitest";
import {
  _resetOrgPolicy,
  blockedConnectorError,
  isConnectorBlocked,
  isConnectorUrlBlocked,
  orgAllowedConnectors,
  setOrgAllowedConnectors,
} from "./orgPolicy";

afterEach(() => _resetOrgPolicy());

describe("setOrgAllowedConnectors", () => {
  it("accepts a list of ids", () => {
    expect(setOrgAllowedConnectors(["notion", "github"])).toEqual(["notion", "github"]);
    expect(orgAllowedConnectors()).toEqual(["notion", "github"]);
  });

  it("distinguishes « pas encore su » (null) from « rien d'ouvert » ([]) — c'est la règle 7", () => {
    // This is THE distinction that stops an allow-list from turning back into a deny-list:
    // an absent policy lets through, an EMPTY policy closes.
    expect(setOrgAllowedConnectors([])).toEqual([]);
    expect(orgAllowedConnectors()).toEqual([]);
    expect(isConnectorBlocked("notion")).toBe(true); // empty = nothing allowed

    _resetOrgPolicy();
    expect(orgAllowedConnectors()).toBeNull(); // never published
    expect(isConnectorBlocked("notion")).toBe(false); // open door, deliberately
  });

  it("CLEARS on anything that is not a list — a half-parsed policy reads as enforced", () => {
    setOrgAllowedConnectors(["notion"]);
    expect(setOrgAllowedConnectors("notion")).toBeNull();
    expect(orgAllowedConnectors()).toBeNull();
    setOrgAllowedConnectors(["notion"]);
    expect(setOrgAllowedConnectors(null)).toBeNull();
    expect(orgAllowedConnectors()).toBeNull();
  });

  it("drops non-string entries rather than stringifying them", () => {
    expect(setOrgAllowedConnectors(["notion", 42, null, "", "github"])).toEqual(["notion", "github"]);
  });
});

describe("isConnectorBlocked", () => {
  it("permits the allowed connector and refuses every other", () => {
    setOrgAllowedConnectors(["notion"]);
    expect(isConnectorBlocked("notion")).toBe(false);
    expect(isConnectorBlocked("github")).toBe(true);
  });

  it("permits EVERY account of it — a second account is a `--` suffixed instance", () => {
    setOrgAllowedConnectors(["gmail"]);
    expect(isConnectorBlocked("gmail--a1b2")).toBe(false);
    expect(isConnectorBlocked("github--a1b2")).toBe(true);
  });

  it("refuses a connector added to the catalogue AFTER the policy was written", () => {
    // The regression the rule-7 switch exists to hold: under a deny-list, a
    // connector the policy didn't name was usable everywhere.
    setOrgAllowedConnectors(["notion"]);
    expect(isConnectorBlocked("un-connecteur-tout-neuf")).toBe(true);
  });

  it("refuses an undefined id under a policy, and stays inert with none", () => {
    setOrgAllowedConnectors(["notion"]);
    expect(isConnectorBlocked(undefined)).toBe(true);
    _resetOrgPolicy();
    expect(isConnectorBlocked(undefined)).toBe(false);
  });
});

describe("isConnectorUrlBlocked — the hole the renderer-only list left open", () => {
  it("permits an ALLOWED connector re-added by URL", () => {
    // The policy names an id; the member adds the same service as a custom server.
    // Matched on the host, which is all a custom spec carries.
    setOrgAllowedConnectors(["notion"]);
    expect(isConnectorUrlBlocked("https://mcp.notion.com/mcp")).toBe(false);
  });

  it("refuses a host no allowed connector claims — including a service outside the catalogue", () => {
    setOrgAllowedConnectors(["notion"]);
    expect(isConnectorUrlBlocked("https://example.com/mcp")).toBe(true);
  });

  it("refuses everything when the org opened nothing", () => {
    setOrgAllowedConnectors([]);
    expect(isConnectorUrlBlocked("https://mcp.notion.com/mcp")).toBe(true);
  });

  it("is inert with no policy, and refuses an unparseable URL under one", () => {
    expect(isConnectorUrlBlocked("https://mcp.notion.com/mcp")).toBe(false);
    setOrgAllowedConnectors(["notion"]);
    expect(isConnectorUrlBlocked("not a url")).toBe(true);
    expect(isConnectorUrlBlocked(undefined)).toBe(true);
  });
});

describe("blockedConnectorError", () => {
  it("names the connector and points at the admin, not at the policy internals", () => {
    setOrgAllowedConnectors(["notion"]);
    const msg = blockedConnectorError("github--a1b2").message;
    expect(msg).toMatch(/organisation/i);
    expect(msg).toMatch(/administrateur/i);
  });
});
