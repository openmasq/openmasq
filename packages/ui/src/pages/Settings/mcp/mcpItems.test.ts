import { describe, it, expect } from "vitest";
import type { McpServerInfo } from "../../../host";
import { buildMcpItems, BROWSER_CONNECTOR_ID } from "./mcpItems";

// The browser is a server the APP registers, not one the user pointed us at. It has a
// catalogued card of its own; the "custom (user-added HTTP)" pass must therefore skip
// its id, or the same connector is listed TWICE — once under its category, once among
// the user-added servers. That is what a user saw as « Navigateur » appearing in two
// sections of the MCP tab.

const browserServer: McpServerInfo = {
  id: BROWSER_CONNECTOR_ID,
  name: "Navigateur",
  url: "",
  kind: "browser",
  connected: true,
  authorized: true,
  toolCount: 16,
};

const build = (servers: McpServerInfo[], browserEnabled = true) =>
  buildMcpItems({
    servers,
    catalog: [],
    directConnectors: [],
    isBlocked: () => false,
    browserEnabled,
  });

describe("buildMcpItems — the built-in browser is listed once", () => {
  it("yields exactly ONE item for the browser when its server is connected", () => {
    const browserItems = build([browserServer]).filter((i) => i.id === BROWSER_CONNECTOR_ID);
    expect(browserItems).toHaveLength(1);
    expect(browserItems[0].kind).toBe("browser");
    expect(browserItems[0].connected).toBe(true);
    expect(browserItems[0].toolCount).toBe(16);
  });

  it("never mints a `custom` card for it — a built-in is not a user-added server", () => {
    expect(build([browserServer]).some((i) => i.custom)).toBe(false);
  });

  it("still lists nothing for it on a host without the capability", () => {
    // browserEnabled=false is the web preview: no card at all, and in particular not
    // the custom-card fallback the missing id used to produce.
    expect(build([browserServer], false).filter((i) => i.id === BROWSER_CONNECTOR_ID)).toEqual([]);
  });

  it("a genuinely user-added server still gets its custom card", () => {
    const custom: McpServerInfo = {
      id: "https://mcp.example.com",
      name: "Mon serveur",
      url: "https://mcp.example.com",
      kind: "http",
      connected: true,
      authorized: true,
    };
    const items = build([browserServer, custom]);
    expect(items.filter((i) => i.custom).map((i) => i.id)).toEqual(["https://mcp.example.com"]);
  });
});
