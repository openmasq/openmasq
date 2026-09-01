import { readFileSync, appendFileSync } from "node:fs";
import type { McpConnection, McpTool, McpToolCall, McpToolResult } from "@openmasq/mcp";
import { devOnly } from "../security/devOnly";

/**
 * E2E-ONLY fixture MCP connections (inert in production). When the app is launched
 * with `OPENMASQ_E2E=1` AND `OPENMASQ_E2E_MCP_FIXTURES=<path.json>`, `connect.ts`
 * registers these in-memory connections alongside the real ones, so a workflow e2e
 * can exercise the FULL agentic pipeline (tool offer → model tool-call → arg
 * un-redaction → result re-redaction → write gate) against canned results instead
 * of real accounts. Security posture (rule 7):
 *  - Gated on TWO env vars set at process launch — a renderer cannot set main's env,
 *    so a compromised renderer cannot summon fixture tools.
 *  - NOTHING here weakens a gate: fixture write-tools still hit the main
 *    write-confirmation window, and results ride the normal redaction pipeline.
 *  - Connections are memory-only: never persisted to the MCP store, dropped by
 *    `mcpCloseAll` like any other connection.
 * The optional `OPENMASQ_E2E_TOOLCALL_LOG` records each call's REAL (un-redacted)
 * arguments — that is the point (asserting rule 11's outward leg) — treat the file
 * like the wire log: test artefact, real PII, never committed.
 */

export interface FixtureTool {
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

/** Parse + validate the fixture file's JSON. Throws with a precise message on a bad
 *  shape — an e2e mis-set fixture must fail LOUD, not register zero tools. */
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

/** One in-memory MCP connection serving a fixture server's canned tools. `logCall`
 *  receives the REAL args after the redacting client un-redacted them — injected so
 *  the pure core stays fs-free in unit tests. */
export function makeFixtureConnection(
  server: FixtureServer,
  logCall?: (entry: { server: string; tool: string; arguments: unknown }) => void,
): McpConnection {
  const byName = new Map(server.tools.map((t) => [t.name, t]));
  return {
    id: server.id,
    async listTools(): Promise<McpTool[]> {
      // BARE names on purpose: main's `refreshRoutes` namespaces the model-facing
      // name as `${serverId}__${name}` itself (a pre-namespaced name would double up).
      return server.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: (t.inputSchema ?? { type: "object", properties: {} }) as McpTool["inputSchema"],
        serverId: server.id,
        ...(t.annotations ? { annotations: t.annotations } : {}),
      }));
    },
    async callTool(call: McpToolCall): Promise<McpToolResult> {
      // The routed call arrives with the REAL tool name (routes strip the namespace),
      // but tolerate the namespaced form so the connection also works standalone.
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

/** The `mcpReconnectStored` entry point: registers one connection per fixture server
 *  into the live map, ONLY under the double env gate (launch-time — a renderer cannot
 *  set main's env). No-op in production; a broken fixture file logs LOUD instead of
 *  silently registering zero tools. */
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
 * E2E-only SUBSET of the account's stored connectors to reconnect
 * (`OPENMASQ_E2E_MCP_ONLY=slack,posthog`). Purpose: a real-connector test that
 * needs Slack shouldn't pay for — nor be destabilised by — 450 offered tools; a
 * ~20-tool catalog is faster, cheaper and far more deterministic, which is what
 * makes iterating on agentic-loop guidance practical.
 *
 * Direction of travel is FAIL-SAFE (it only ever reconnects FEWER connectors) and
 * it is double-gated on launch-time env (`OPENMASQ_E2E` — a renderer cannot set
 * main's env), like the fixture hook. `null` ⇒ no restriction (production).
 * `id` matches the STORED server id, so a multi-account instance (`gmail--2`)
 * matches on its connector prefix too. Pure — pinned by `e2eFixtures.test.ts`.
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
  // `browser` stays reachable only if named explicitly — it is a heavy connector.
  return (id: string) => allowed.has(id.toLowerCase()) || allowed.has(id.split("--")[0]!.toLowerCase());
}

/** Read the fixture file and build one connection per declared server, appending
 *  each call to `OPENMASQ_E2E_TOOLCALL_LOG` (jsonl) when set. Caller is `connect.ts`
 *  under the env gate; throws on an unreadable/invalid file (fail loud). */
export function loadE2eFixtureConnections(path: string): McpConnection[] {
  const servers = parseFixtureServers(readFileSync(path, "utf8"));
  // Writes the REAL, un-redacted tool arguments — the same capability as
  // OPENMASQ_MCP_RAW_LOG, and gated the same way.
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
