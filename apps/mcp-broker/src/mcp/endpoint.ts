import { Router, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getPlatform } from "../platforms/registry.js";
import { bearerFetchJson } from "../util/fetchJson.js";
import { requireBrokerAuth, type AuthedRequest } from "./auth.js";

/**
 * The MCP endpoint for a platform: `/:platform/mcp`. Each request builds a fresh,
 * stateless `McpServer` wired to the authenticated platform tools, so the
 * upstream token is scoped to exactly this request and never shared across users.
 */
export const mcpRouter = Router();

async function handle(req: AuthedRequest, res: Response): Promise<void> {
  const platform = getPlatform(String(req.params.platform));
  const rec = req.broker;
  if (!platform || !rec) {
    res.status(404).json({ error: "unknown_platform" });
    return;
  }

  const server = new McpServer({ name: `openmasq-broker:${platform.id}`, version: "0.1.0" });
  platform.registerTools(server, {
    accessToken: rec.upstream.accessToken,
    fetchJson: bearerFetchJson(rec.upstream.accessToken),
  });

  // Stateless: no session id — one transport per request, torn down on close.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

mcpRouter.post("/:platform/mcp", requireBrokerAuth, handle);
mcpRouter.get("/:platform/mcp", requireBrokerAuth, handle);
mcpRouter.delete("/:platform/mcp", requireBrokerAuth, handle);
