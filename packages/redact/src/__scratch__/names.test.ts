import { it } from "vitest";
import { MCP_CONNECTORS } from "@openmasq/catalog/mcp";
it("names", () => { console.log(MCP_CONNECTORS.map((c) => `${c.id}=${c.name}`).join(" | ")); });
