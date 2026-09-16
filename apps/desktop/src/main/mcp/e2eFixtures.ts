import { readFileSync, appendFileSync } from "node:fs";
import type { McpConnection, McpTool, McpToolCall, McpToolResult } from "@openmasq/mcp";
import { devOnly } from "../security/devOnly";

/**
 * E2E-ONLY fixture MCP connections, inert in production: with `OPENMASQ_E2E=1` AND
 * `OPENMASQ_E2E_MCP_FIXTURES=<path.json>` at launch, in-memory connections serve canned
 * results so a workflow e2e exercises the FULL agentic pipeline. Rule 7: gated on env a
 * renderer cannot set; NOTHING weakens a gate; memory-only, never persisted.
 * `OPENMASQ_E2E_TOOLCALL_LOG` records each call's REAL arguments (rule 11's outward leg):
 * a test artefact holding real PII, never committed.
 */

interface FixtureTool {
  name: string;
  description?: string;
  /** JSON Schema for the arguments. Defaults to an open object. */
  inputSchema?: Record<string, unknown>;
  /** MCP behaviour hints; e.g. `{ readOnlyHint: true }` for a pure read. */
  annotations?: McpTool["annotations"];
  /** The canned result text returned on every call. */
  result: string;
}

export interface FixtureServer {
  id: string;
  tools: FixtureTool[];
}

/** Parse + validate the fixture file. Throws: a mis-set fixture fails LOUD. */
export function parseFixtureServers(json: string): FixtureServer[] {
  const raw = JSON.parse(json) as { servers?: unknown };
  if (!raw || !Array.isArray(raw.servers)) throw new Error("fixtures: `servers` array missing");
  return raw.servers.map((s, i) => {
    const sv = s as Partial<FixtureServer>;
    if (!sv.id || typeof sv.id !== "string") throw new Error(`fixtures: servers[${i}].id missing`);
    if (!Array.isArray(sv.tools)) throw new Error(`fixtures: servers[${i}].tools missing`);
    for (const [j, t] of sv.tools.entries()) {
      if (!t.name || typeof t.name !== "string")
        throw new Error(`fixtures: servers[${i}].tools[${j}].name missing`);
      if (typeof t.result !== "string")
        throw new Error(`fixtures: servers[${i}].tools[${j}].result must be a string`);
    }
    return { id: sv.id, tools: sv.tools };
  });
}

/** One in-memory connection serving canned tools. `logCall` (injected, fs-free core)
 *  receives the REAL args. */
export function makeFixtureConnection(
  server: FixtureServer,
  logCall?: (entry: { server: string; tool: string; arguments: unknown }) => void,
): McpConnection {
  const byName = new Map(server.tools.map((t) => [t.name, t]));
  return {
    id: server.id,
    async listTools(): Promise<McpTool[]> {
      // BARE names: `refreshRoutes` namespaces them itself.
      return server.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: (t.inputSchema ?? { type: "object", properties: {} }) as McpTool["inputSchema"],
        serverId: server.id,
        ...(t.annotations ? { annotations: t.annotations } : {}),
      }));
    },
    async callTool(call: McpToolCall): Promise<McpToolResult> {
      // The routed call carries the REAL name; tolerate the namespaced form standalone.
      const bare = call.name.startsWith(`${server.id}__`)
        ? call.name.slice(server.id.length + 2)
        : call.name;
      const tool = byName.get(bare);
      logCall?.({ server: server.id, tool: bare, arguments: call.arguments });
      if (!tool) {
        return { content: [{ type: "text", text: `Unknown fixture tool: ${bare}` }], isError: true };
      }
      return { content: [{ type: "text", text: tool.result }] };
    },
    async close(): Promise<void> {
      /* memory-only — nothing to release */
    },
  };
}

/** Registers one connection per fixture server, ONLY under the double env gate. */
export function maybeRegisterE2eFixtureConnections(
  connected: Map<string, McpConnection>,
): void {
  const fixtures = devOnly(process.env.OPENMASQ_E2E_MCP_FIXTURES);
  if (!devOnly(process.env.OPENMASQ_E2E) || !fixtures) return;
  try {
    for (const conn of loadE2eFixtureConnections(fixtures)) {
      connected.set(conn.id, conn);
    }
  } catch (err) {
    console.error("[e2e] fixture MCP registration failed:", err);
  }
}

/**
 * E2E-only SUBSET of the stored connectors to reconnect (`OPENMASQ_E2E_MCP_ONLY=a,b`): a
 * small tool catalog is faster and more deterministic. FAIL-SAFE (only ever FEWER), double
 * env-gated, identity in production. Matches a multi-account instance on its connector
 * prefix. Pinned by `e2eFixtures.test.ts`.
 */
export function e2eFilterServers<T extends { id: string }>(servers: T[]): T[] {
  const keep = e2eConnectorFilter();
  return keep ? servers.filter((s) => keep(s.id)) : servers;
}

export function e2eConnectorFilter(): ((id: string) => boolean) | null {
  if (!devOnly(process.env.OPENMASQ_E2E)) return null;
  const raw = process.env.OPENMASQ_E2E_MCP_ONLY;
  if (!raw) return null;
  const allowed = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!allowed.size) return null;
  // `browser` only if named explicitly.
  return (id: string) => allowed.has(id.toLowerCase()) || allowed.has(id.split("--")[0]!.toLowerCase());
}

/** One connection per declared server, each call appended to the jsonl log when set.
 *  Throws on an unreadable/invalid file. */
export function loadE2eFixtureConnections(path: string): McpConnection[] {
  const servers = parseFixtureServers(readFileSync(path, "utf8"));
  // REAL, un-redacted arguments: the same capability and gate as OPENMASQ_MCP_RAW_LOG.
  const logPath = devOnly(process.env.OPENMASQ_E2E_TOOLCALL_LOG);
  const logCall = logPath
    ? (entry: { server: string; tool: string; arguments: unknown }) => {
        try {
          appendFileSync(logPath, JSON.stringify(entry) + "\n");
        } catch {
          /* best-effort: never break a tool call for the log */
        }
      }
    : undefined;
  return servers.map((s) => makeFixtureConnection(s, logCall));
}
