// `/mcp` — the proxy's own MCP server, the second half of the same boundary. The agent
// points its MCP client here instead of at Gmail or Notion, and gets the SAME tools with
// the values replaced. It never holds a credential and never sees a real value.
//
// The low-level `Server` is used on purpose, not `McpServer`: the upstream `inputSchema` is
// JSON Schema and must reach the agent BYTE FOR BYTE. Re-deriving it from a Zod shape would
// quietly drop the constraints a server declared, and a tool whose schema we rewrote is a
// tool we can no longer claim to be proxying.
import { Router, type NextFunction, type Request, type Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Reporter } from "../../lib/ui/index.js";
import type { Locals } from "../../lib/relay.js";
import type { McpBridge } from "./bridge.js";

export interface McpRouteDeps {
  bridge: McpBridge;
  reporter: Reporter;
  version: string;
}

const INFO = { name: "openmasq-proxy", title: "OpenMasq", version: "0.0.0" };

/**
 * The MCP body, read from the raw buffer the app already collects. It differs from the
 * model-facing `parseJsonObject` on one point that matters: a JSON-RPC batch is an ARRAY,
 * which that one refuses on purpose. Everything else is as strict — a body we cannot read
 * is a body we cannot mask, so it stops here rather than reaching a server.
 */
export function mcpBody(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== "POST") return next();
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    res
      .status(400)
      .json({ error: { type: "openmasq_proxy", message: "Expected a JSON-RPC body." } });
    return;
  }
  if (!parsed || typeof parsed !== "object") {
    res
      .status(400)
      .json({ error: { type: "openmasq_proxy", message: "Expected a JSON-RPC body." } });
    return;
  }
  req.body = parsed;
  next();
}

/** The error text the AGENT receives. It names the tool and the failure, never a value from
 *  the arguments and never anything the upstream sent back verbatim. */
const failed = (name: string, err: unknown): string =>
  `${name} failed: ${err instanceof Error ? err.message : String(err)}`;

function buildServer(deps: McpRouteDeps, locals: Locals, reportedAt: () => number): Server {
  const server = new Server({ ...INFO, version: deps.version }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = await deps.bridge.listTools();
    return {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        ...(t.annotations ? { annotations: t.annotations } : {}),
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    const started = reportedAt();
    try {
      const outcome = await deps.bridge.callTool(name, args, locals);
      locals.matches.push(...outcome.matches);
      deps.reporter.request({
        method: "TOOL",
        path: name,
        family: outcome.refused ? "mcp refused" : "mcp",
        status: outcome.refused ? 403 : outcome.result.isError ? 502 : 200,
        ms: reportedAt() - started,
        matches: outcome.matches,
        stream: false,
      });
      return { content: outcome.result.content, isError: outcome.result.isError === true };
    } catch (err) {
      // Fail closed and LEGIBLY: a thrown tool is an error result the agent can read, never
      // a silent success and never a dropped stream it would retry forever.
      deps.reporter.request({
        method: "TOOL",
        path: name,
        family: "mcp",
        status: 502,
        ms: reportedAt() - started,
        matches: [],
        stream: false,
      });
      return { content: [{ type: "text", text: failed(name, err) }], isError: true };
    }
  });

  return server;
}

/**
 * The router `app.ts` mounts AT `/mcp`, with its own JSON parser: a JSON-RPC batch is an
 * ARRAY, which the model-facing `parseJsonObject` refuses on purpose (a body it cannot read
 * is a body it cannot mask). Two parsers, each strict about its own wire.
 *
 * Stateless: one transport per request, torn down on close — the same shape as the broker's
 * endpoint, for the same reason (no cross-request state to confuse two callers).
 */
export default function mcpRouter(deps: McpRouteDeps): Router {
  const router = Router();
  const handle = async (req: Request, res: Response): Promise<void> => {
    const server = buildServer(deps, res.locals as Locals, () => Date.now());
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  };
  router.post("/", handle);
  router.get("/", handle);
  router.delete("/", handle);
  return router;
}
