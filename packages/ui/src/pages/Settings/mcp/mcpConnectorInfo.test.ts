import { describe, it, expect } from "vitest";
import { MCP_CONNECTORS } from "@openmasq/catalog/mcp";
import { MCP_CONNECTOR_INFO } from "./mcpConnectorInfo";
import { MCP_LOGOS, MCP_LOGO_IMAGES } from "../../../components/media/McpTile";

// The catalog is the single id source (rule 9); these two UI side-tables are keyed
// by it BY HAND. A typo'd key breaks nothing visibly — the modal just renders no
// about block / the tile falls back to a letter — so parity is pinned here instead
// of trusted.

const catalogIds = new Set(MCP_CONNECTORS.map((c) => c.id));

describe("mcp side-tables ↔ catalog parity", () => {
  it("every MCP_CONNECTOR_INFO key is a real catalog connector id", () => {
    for (const id of Object.keys(MCP_CONNECTOR_INFO))
      expect(catalogIds.has(id), `info entry \`${id}\` matches no catalog connector`).toBe(true);
  });

  it("every MCP_LOGOS key is a real catalog connector id (except figma, kept for a future preset)", () => {
    for (const id of Object.keys(MCP_LOGOS)) {
      if (id === "figma") continue; // legacy entry, no catalog connector yet
      expect(catalogIds.has(id), `logo entry \`${id}\` matches no catalog connector`).toBe(true);
    }
  });

  it("every MCP_LOGO_IMAGES key is a real catalog connector id, and a data: URL", () => {
    for (const [id, uri] of Object.entries(MCP_LOGO_IMAGES)) {
      expect(catalogIds.has(id), `logo-image entry \`${id}\` matches no catalog connector`).toBe(true);
      expect(uri, `\`${id}\` must be an inlined data: URL (CSP: no remote host)`).toMatch(
        /^data:image\/(png|svg\+xml);/,
      );
    }
  });

  it("no connector carries both a vector glyph and a raster favicon", () => {
    for (const id of Object.keys(MCP_LOGO_IMAGES))
      expect(MCP_LOGOS[id], `\`${id}\` is in both logo tables — pick one`).toBeUndefined();
  });

  it("every company-backed connector has an about + website (the modal's trust block)", () => {
    // Company-backed = remote + direct. builtin/stdio/broker-demo have no company
    // website by design (the browser and the local filesystem are OURS).
    const companyBacked = MCP_CONNECTORS.filter(
      (c) => c.transport === "remote" || c.transport === "direct",
    );
    for (const c of companyBacked) {
      const info = MCP_CONNECTOR_INFO[c.id];
      expect(info, `\`${c.id}\` has no MCP_CONNECTOR_INFO entry`).toBeTruthy();
      expect(info.website, `\`${c.id}\` website must be https`).toMatch(/^https:\/\//);
      // Digestible = one short French sentence, not a paragraph.
      expect(info.about.length, `\`${c.id}\` about is too long for the modal`).toBeLessThan(140);
    }
  });
});
