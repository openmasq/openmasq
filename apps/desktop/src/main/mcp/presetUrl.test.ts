import { describe, expect, it } from "vitest";
import { findConnector } from "@openmasq/catalog/mcp";
import { withCatalogUrl } from "./presetUrl";

/**
 * The whole point is a stored preset that has gone stale. Two ways to break it: forget to
 * refresh it (the Zapier 401 nobody could clear by re-authenticating), or refresh too
 * much and overwrite the URL a user typed into a custom server.
 */

describe("withCatalogUrl", () => {
  it("replaces a stale preset URL with the catalog's", () => {
    const stale = { id: "zapier", url: "https://mcp.zapier.com/api/mcp/mcp" };
    expect(withCatalogUrl(stale).url).toBe(findConnector("zapier")?.url);
    expect(withCatalogUrl(stale).url).not.toBe(stale.url);
  });

  it("leaves a USER-ADDED server's URL alone", () => {
    // A custom id resolves to no connector, which is the guard — its URL is the only
    // thing the user actually chose.
    const custom = { id: "custom-a1b2c3d4e5f6", url: "https://mcp.example.test/mcp" };
    expect(withCatalogUrl(custom)).toBe(custom);
  });

  it("follows a multi-account instance back to its connector", () => {
    const second = { id: "zapier--a1b2", url: "https://mcp.zapier.com/api/mcp/mcp" };
    expect(withCatalogUrl(second).url).toBe(findConnector("zapier")?.url);
  });

  it("returns the SAME object when nothing needs changing (no needless churn)", () => {
    const fresh = { id: "zapier", url: findConnector("zapier")?.url };
    expect(withCatalogUrl(fresh)).toBe(fresh);
    // A connector with no URL of its own (stdio / direct) can never be rewritten.
    const stdio = { id: "filesystem", url: undefined };
    expect(withCatalogUrl(stdio)).toBe(stdio);
  });

  it("preserves every other field", () => {
    const spec = { id: "zapier", name: "Zapier", label: "Compte 2", url: "https://old.test" };
    expect(withCatalogUrl(spec)).toMatchObject({ name: "Zapier", label: "Compte 2" });
  });
});

describe("the Zapier endpoint itself", () => {
  it("is the OAuth `connect` path, never the server-token `/api/mcp/*` family", () => {
    // `/api/mcp/mcp` publishes RFC 9728 metadata and accepts open DCR, so it LOOKS
    // one-click — then rejects the resulting bearer with 401 `invalid_token`. Pin the
    // path so a future edit can't quietly reintroduce the dead one.
    const url = findConnector("zapier")?.url ?? "";
    expect(url).toBe("https://mcp.zapier.com/api/v1/connect");
    expect(url).not.toMatch(/\/api\/mcp\//);
  });
});
