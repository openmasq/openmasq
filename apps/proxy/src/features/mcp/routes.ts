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
import type { Signal } from "./reload.js";
import { sameToken } from "./endpointToken.js";

export interface McpRouteDeps {
  bridge: McpBridge;
  /** The key to this endpoint (`endpointToken.ts`). It runs the user's connected tools with
   *  the user's credentials, so it is gated like `/console` — and answers 404 without it,
   *  never 401: an endpoint that admits it exists invites guessing. */
  token: string;
  reporter: Reporter;
  version: string;
  /** Fires when the tool list moved (`reload.ts`): every agent holding a GET stream open is
   *  told `notifications/tools/list_changed`, and re-lists. */
  changes?: Signal;
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

/** The error text the AGENT receives. It names the tool, never a value from the arguments and
 *  never anything the upstream sent back: a server's error quotes what it could not find (« no
 *  mailbox for <the real address> »), and this text reaches the model unmasked. */
const failed = (name: string, _err: unknown): string =>
  `${name} failed on the server's side; its message is withheld (it can quote personal data). ` +
  "Check the arguments, or ask the user to look at the proxy's terminal.";

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
 * ARRAY, which the model-facing `parseJsonObject` refuses on purpose. Stateless: one
 * transport per request, torn down on close. The one thing kept across requests is the set
 * of GET streams still open — the channel `tools/list_changed` travels on.
 */
/** The token may travel in the query (every client carries a URL verbatim) or in a header,
 *  for a caller that would rather not put it in a URL. */
const authorized = (req: Request, token: string): boolean => {
  const q = req.query.t;
  if (typeof q === "string" && sameToken(q, token)) return true;
  const h = req.headers["x-openmasq-mcp-token"];
  return typeof h === "string" && sameToken(h, token);
};

export default function mcpRouter(deps: McpRouteDeps): Router {
  const router = Router();
  const listening = new Set<Server>();
  deps.changes?.on(() => {
    for (const server of listening) void server.sendToolListChanged().catch(() => {});
  });
  const handle = async (req: Request, res: Response): Promise<void> => {
    if (!authorized(req, deps.token)) {
      res.status(404).end();
      return;
    }
    const server = buildServer(deps, res.locals as Locals, () => Date.now());
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    if (req.method === "GET") listening.add(server);
    res.on("close", () => {
      listening.delete(server);
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
