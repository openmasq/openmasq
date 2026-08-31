/**
 * The SUBSCRIPTION turn's tool bridge: a minimal, loopback MCP server, that the user's
 * CLI calls during ONE turn — and which does only one thing: CAPTURE
 * the tool call instead of executing it.
 *
 * This is the piece that makes the CLI path identical to the API path (product
 * requirement): OpenMasq's agentic loop stays in CHARGE. The CLI is only a
 * completion primitive — when its model wants a tool, the call is handed back to OUR
 * loop (`mcpAgent`), which does exactly what it does for an API model: un-redact
 * the arguments with the vault, pass the write gate, execute via the redacting MCP
 * client, re-redact the result. None of this is duplicated here (rule 9);
 * this module only ever sees arguments that are STILL redacted.
 *
 * Measured (CLI 2.1.246): a `--mcp-config` of type `http` on 127.0.0.1 with header
 * `Authorization: Bearer …` connects, lists and calls — no relay process nor
 * bundled asset is needed. The CLI also emits `server/discover` before
 * `initialize`: any unknown method carrying an id gets an empty result rather
 * than an error, otherwise the connection fails.
 *
 * Boundary (rule 7):
 * - bound to 127.0.0.1 only, ephemeral port, ONE turn = ONE server + ONE disposable token;
 * - token required on EVERY request, checked before any body is read (fail closed) —
 *   any local process can reach a loopback port;
 * - a tool name outside the catalog is REFUSED as a JSON-RPC error, never captured: the
 *   model self-corrects within its turn, and nothing unknown reaches the loop;
 * - `close()` destroys pending responses — a killed CLI leaves no open socket.
 */
import { randomBytes } from "node:crypto";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { ToolDef } from "@openmasq/llm";

/** The server name in the CLI's MCP config — this IS that server. The CLI prefixes
 *  each tool with it (`mcp__<name>__…` on claude), and codex's config takes it as the key of
 *  `mcp_servers.<name>`: one single home for both recipes (rule 9). */
export const TOOLS_SERVER_NAME = "openmasq";

/** A captured call — the REAL name (without the CLI's `mcp__<server>__` prefix) and
 *  arguments still redacted, already parsed. */
export interface CapturedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolsBridge {
  /** The URL to write into the CLI's `--mcp-config`. */
  url: string;
  /** The expected Bearer token — to write into the config file (0600), NEVER in argv. */
  token: string;
  /** Resolves on the FIRST valid tool call. Never resolves if the turn ends in text. */
  nextCall(): Promise<CapturedToolCall>;
  close(): void;
}

const JSONRPC = "2.0";

function reply(res: ServerResponse, id: unknown, body: Record<string, unknown>): void {
  res
    .writeHead(200, { "content-type": "application/json" })
    .end(JSON.stringify({ jsonrpc: JSONRPC, id, ...body }));
}

/** Starts the bridge for a turn. `tools` is THIS turn's catalog, real names. */
export function startToolsBridge(tools: ToolDef[]): Promise<ToolsBridge> {
  const token = randomBytes(24).toString("hex");
  const known = new Map(tools.map((t) => [t.name, t]));
  const parked = new Set<ServerResponse>();

  let capture: ((call: CapturedToolCall) => void) | null = null;
  const first = new Promise<CapturedToolCall>((resolve) => {
    let done = false;
    capture = (call) => {
      if (done) return; // a 2nd call during shutdown: ignored, the CLI is already condemned
      done = true;
      resolve(call);
    };
  });

  const server: Server = createServer((req, res) => {
    // Token first, before reading anything: a loopback port is reachable
    // by any local process — without a valid Bearer, there is no request.
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401).end();
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(body) as Record<string, unknown>;
      } catch {
        res.writeHead(400).end();
        return;
      }
      const params = (msg.params ?? {}) as Record<string, unknown>;
      switch (msg.method) {
        case "initialize":
          reply(res, msg.id, {
            result: {
              protocolVersion: "2025-03-26",
              capabilities: { tools: {} },
              serverInfo: { name: "openmasq-tools", version: "1" },
            },
          });
          return;
        case "tools/list":
          reply(res, msg.id, {
            result: {
              tools: tools.map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: t.parameters,
              })),
            },
          });
          return;
        case "tools/call": {
          const name = typeof params.name === "string" ? params.name : "";
          if (!known.has(name)) {
            // Refusal, not capture: a hallucinated name comes back to the model as a tool
            // error and it self-corrects — the loop never sees an unknown one.
            reply(res, msg.id, {
              error: { code: -32602, message: `Outil inconnu : ${name}` },
            });
            return;
          }
          const args =
            params.arguments && typeof params.arguments === "object"
              ? (params.arguments as Record<string, unknown>)
              : {};
          // PARKED: no reply is sent — the v1 turn kills the CLI as soon as the call is captured and
          // the loop re-submits the full history on the next turn (same stateless
          // contract as every other provider). `close()` destroys the response.
          parked.add(res);
          res.on("close", () => parked.delete(res));
          capture?.({ name, arguments: args });
          return;
        }
        default:
          // `server/discover`, `notifications/*`… — an id ⇒ empty result (measured:
          // an error here fails the connection), no id ⇒ bare 202.
          if (msg.id !== undefined) reply(res, msg.id, { result: {} });
          else res.writeHead(202).end();
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr === null || typeof addr === "string") {
        reject(new Error("port du pont d'outils indisponible"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}/mcp`,
        token,
        nextCall: () => first,
        close: () => {
          for (const res of parked) res.destroy();
          parked.clear();
          server.close();
        },
      });
    });
  });
}
