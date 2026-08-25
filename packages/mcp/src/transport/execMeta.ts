import { BRAND } from "@openmasq/branding";
import type { McpConnection, McpTool, McpToolCall, McpToolResult, JsonObject } from "../types";
import { resultText } from "../redact/walk";

/*
 * EXEC-META adapter — expose a "MCP-in-a-tool" server's sub-tools DIRECTLY.
 *
 * Some MCP servers (PostHog's `mcp.posthog.com`) expose ~280 tools behind a SINGLE
 * CLI-style meta-tool: `exec {command, context}`, where `command` is `tools` /
 * `search <q>` / `info <tool>` / `call <tool> <json-args>`. Small models fail this
 * pattern hard — they call `exec` without the required `command`, loop, and never
 * reach the real tool (measured on the eval bench). This adapter DECORATES the
 * connection so the sub-tools become first-class: the model calls
 * `posthog__query-trends {…}` directly and the adapter translates it to
 * `exec {command:"call query-trends {…}"}`.
 *
 * COST: each sub-tool's schema needs its own `exec info <tool>` round-trip, so
 * expanding all ~280 at connect is slow AND risks rate-limiting the server. We
 * therefore expand a FILTERED set (`opts.include` — the high-value analytics/query
 * tools) and keep the raw `exec` tool available for the long tail. Schemas are
 * fetched concurrency-capped and CACHED for the connection's lifetime.
 *
 * FAIL-SAFE: any enumeration failure (exec errors, junk output) falls back to the
 * connection's RAW tools unchanged — the connector never breaks, it just keeps the
 * `exec` UX. Nothing about redaction / the write gate changes: the translated call
 * is an ORDINARY `callTool` to the same server, gated + redacted exactly as before.
 */

/** The single meta-tool name these servers expose. */
export const EXEC_META_TOOL = "exec";

/** The `context` string sent with every meta-tool command (the server logs it). */
const EXEC_CONTEXT = `${BRAND.name} direct-tool adapter`;

/** Is `tools` an exec-meta server — a lone `exec` tool taking a `command` string? */
export function findExecMetaTool(tools: McpTool[]): McpTool | null {
  const exec = tools.find((t) => t.name === EXEC_META_TOOL);
  if (!exec) return null;
  const props = (exec.inputSchema?.properties ?? {}) as Record<string, unknown>;
  return "command" in props ? exec : null;
}

/** `exec tools` / `exec search` return a JSON array of tool-name strings (possibly
 *  wrapped as `{"matches":[…]}`). Extract the names; `[]` on anything unparseable. */
export function parseExecToolNames(text: string): string[] {
  try {
    const j = JSON.parse(text) as unknown;
    const arr = Array.isArray(j) ? j : Array.isArray((j as { matches?: unknown }).matches) ? (j as { matches: unknown[] }).matches : [];
    return arr.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

const PASSTHROUGH_SCHEMA: JsonObject = { type: "object", additionalProperties: true };

/** Parse an `exec info <tool>` block (a YAML-ish header + a quoted JSON
 *  `inputSchema:`). Returns the sub-tool's model-facing metadata; the schema falls
 *  back to a permissive passthrough so the tool stays callable even if unparseable. */
export function parseExecToolInfo(text: string, fallbackName: string): {
  name: string;
  description?: string;
  inputSchema: JsonObject;
  readOnly: boolean;
} {
  const name = /^name:\s*(.+)$/m.exec(text)?.[1]?.trim() || fallbackName;
  const title = /^title:\s*(.+)$/m.exec(text)?.[1]?.trim();
  // description: single line OR a `|-` block up to the next top-level key.
  const descM = /^description:\s*(\|-?\s*)?\n?([\s\S]*?)(?=\n(?:annotations|inputSchema|title):|\n?$)/m.exec(text);
  const description = (descM?.[2]?.trim() || title || "").slice(0, 400) || undefined;
  const readOnly = /readOnlyHint:\s*true/.test(text);
  // inputSchema is a quoted JSON blob, typically the LAST field; the JSON itself
  // carries no bare single quotes, so span from its first quote to the last.
  let inputSchema = PASSTHROUGH_SCHEMA;
  const i = text.indexOf("inputSchema:");
  if (i >= 0) {
    const q1 = text.indexOf("'", i);
    const q2 = text.lastIndexOf("'");
    if (q1 >= 0 && q2 > q1) {
      try {
        const parsed = JSON.parse(text.slice(q1 + 1, q2)) as JsonObject;
        if (parsed && typeof parsed === "object") inputSchema = parsed;
      } catch {
        /* keep passthrough */
      }
    }
  }
  return { name, description, inputSchema, readOnly };
}

/** Build the `exec` call that runs a sub-tool: `call <tool> <compact-json-args>`. */
export function execCallCommand(subTool: string, args: JsonObject): string {
  const hasArgs = args && Object.keys(args).length > 0;
  return hasArgs ? `call ${subTool} ${JSON.stringify(args)}` : `call ${subTool}`;
}

export interface ExecMetaOptions {
  /** Which sub-tools to EXPAND directly (the rest stay behind raw `exec`). Absent =
   *  expand all — only safe for a small server; PostHog MUST pass a filter. */
  include?: (name: string) => boolean;
  /** Hard cap on expanded sub-tools (bounds connect cost / rate-limit). Default 48. */
  maxTools?: number;
  /** Concurrency for the per-tool `exec info` schema fetches. Default 6. */
  concurrency?: number;
  /** When an `include` filter is set (so a LONG TAIL of un-expanded tools exists),
   *  keep the raw `exec` tool alongside the expanded ones — the escape hatch for a
   *  tool we didn't surface directly, so no capability is silently dropped. Default
   *  true. (No effect when everything is expanded — there is no tail.) */
  keepExecFallback?: boolean;
}

/** Description stamped on the retained `exec` fallback so a model reaches for it ONLY
 *  for a tool not offered directly — the direct tools are the happy path. */
const EXEC_FALLBACK_DESC =
  "Avancé — accès aux outils PostHog NON listés directement ci-dessus (rapports, " +
  "expériences, exports…). Renseigne OBLIGATOIREMENT `command` : `tools` pour lister, " +
  "`search <mots>` pour chercher, `info <outil>` pour le schéma, `call <outil> <json>` " +
  "pour l'exécuter. Préfère toujours un outil direct quand il existe.";

/**
 * Wrap a connection so an exec-meta server's sub-tools are exposed directly. If the
 * connection is NOT an exec-meta server, or enumeration fails, returns it unchanged.
 */
export function wrapExecMeta(inner: McpConnection, opts: ExecMetaOptions = {}): McpConnection {
  const maxTools = opts.maxTools ?? 48;
  const concurrency = opts.concurrency ?? 6;
  const keepExecFallback = opts.keepExecFallback ?? true;
  let expanded: McpTool[] | null = null; // cache: enumerate once per connection
  const subTools = new Set<string>(); // names we translate on callTool

  const exec = (command: string): Promise<McpToolResult> =>
    inner.callTool({
      name: EXEC_META_TOOL,
      arguments: { command, context: EXEC_CONTEXT } as JsonObject,
    });

  async function enumerate(rawTools: McpTool[], metaTool: McpTool): Promise<McpTool[]> {
    const names = parseExecToolNames(resultText((await exec("tools")).content));
    const filtered = opts.include ? names.filter((n) => opts.include!(n)) : names;
    const picked = filtered.slice(0, maxTools);
    if (!picked.length) return rawTools; // nothing to expand → keep raw exec
    // Fetch schemas concurrency-capped.
    const out: McpTool[] = [];
    for (let i = 0; i < picked.length; i += concurrency) {
      const batch = picked.slice(i, i + concurrency);
      const infos = await Promise.all(
        batch.map(async (n) => {
          try {
            return parseExecToolInfo(resultText((await exec(`info ${n}`)).content), n);
          } catch {
            return { name: n, description: undefined, inputSchema: PASSTHROUGH_SCHEMA, readOnly: true };
          }
        }),
      );
      for (const info of infos) {
        subTools.add(info.name);
        out.push({
          name: info.name,
          description: info.description,
          inputSchema: info.inputSchema,
          serverId: inner.id,
          annotations: info.readOnly ? { readOnlyHint: true } : undefined,
        });
      }
    }
    // A FILTER hid a long tail (we expanded fewer than the server offers): keep the
    // raw `exec` tool as the escape hatch so nothing is silently unreachable. `exec`
    // isn't in `subTools`, so it passes straight through in callTool (no translation).
    if (keepExecFallback && filtered.length < names.length) {
      out.push({ ...metaTool, description: EXEC_FALLBACK_DESC });
    }
    return out;
  }

  return {
    id: inner.id,
    async listTools() {
      if (expanded) return expanded;
      const rawTools = await inner.listTools();
      const meta = findExecMetaTool(rawTools);
      if (!meta) return (expanded = rawTools); // not an exec-meta server
      try {
        expanded = await enumerate(rawTools, meta);
      } catch {
        expanded = rawTools; // FAIL-SAFE: keep the raw exec UX, never break the connector
      }
      return expanded;
    },
    async callTool(call: McpToolCall): Promise<McpToolResult> {
      // A translated sub-tool → drive it through the meta-tool; everything else
      // (including a direct `exec` call) passes straight through.
      if (subTools.has(call.name)) {
        return inner.callTool({
          id: call.id,
          name: EXEC_META_TOOL,
          arguments: {
            command: execCallCommand(call.name, (call.arguments ?? {}) as JsonObject),
            context: EXEC_CONTEXT,
          } as JsonObject,
        });
      }
      return inner.callTool(call);
    },
    close: () => inner.close(),
  };
}
