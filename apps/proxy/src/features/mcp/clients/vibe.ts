import { randomBytes } from "node:crypto";
import {
  mergedByName,
  readVibeFiles,
  userDisabledTools,
  type VibeFiles,
} from "../../vibe/index.js";
import type { AgentClient, OwnServer } from "./types.js";

type Entry = Record<string, unknown>;
const HTTP = new Set(["http", "streamable-http"]);

/** Keys an agent profile may set that outrank our variables on the MCP side. */
const AGENT_MCP_KEYS = ["mcp_servers", "enable_connectors", "connectors", "enabled_tools"];

/** Vibe's entries as it will load them — merged by name, the disabled ones left out (they are
 *  not part of the session). Each is handed over in Claude Desktop's shape for adoption; one
 *  whose credential Vibe resolves itself (`auth`, `api_key_env`) is handed over WITHOUT it,
 *  so its adoption fails loudly at connect rather than a secret being read here. */
export function vibeServers(files: VibeFiles): OwnServer[] {
  const own: OwnServer[] = [];
  for (const e of mergedByName(files.configs, "mcp_servers") as Entry[]) {
    if (e.disabled === true) continue;
    const id = String(e.name);
    if (HTTP.has(String(e.transport)) && typeof e.url === "string")
      own.push({
        id,
        scope: "vibe",
        url: e.url,
        raw: { type: "http", url: e.url, headers: e.headers ?? {} },
      });
    else if (typeof e.command === "string")
      own.push({
        id,
        scope: "vibe",
        raw: { command: e.command, args: e.args ?? [], env: e.env ?? {} },
      });
  }
  return own;
}

/**
 * Our entry, in Vibe's shape. The key rides a HEADER, not the URL: Vibe copies the server's URL
 * into every tool RESULT it sends the model (`server: <url>`), and a key in the query string
 * would go out with it. The per-run header is part of what Vibe hashes to cache a server's tool
 * list for a day: without it, a run whose integrations were down caches an EMPTY list for our
 * stable URL, and the next runs show no tools at all (measured on vibe 2.25.8).
 */
export function ourEntry(endpoint: string): Entry {
  const u = new URL(endpoint);
  const token = u.searchParams.get("t");
  u.search = "";
  return {
    name: "openmasq",
    transport: "streamable-http",
    url: u.toString(),
    headers: {
      ...(token ? { "x-openmasq-mcp-token": token } : {}),
      "x-openmasq-run": randomBytes(6).toString("hex"),
    },
  };
}

/** One of theirs, switched off: the least Vibe needs to recognise the entry and validate it.
 *  Never the whole entry — its headers and env carry tokens, and this list is an environment
 *  variable every command Vibe runs inherits. */
function stub(e: Entry): Entry {
  const where = typeof e.command === "string" ? { command: e.command } : { url: e.url };
  return { name: e.name, transport: e.transport, ...where, disabled: true };
}

/**
 * Mistral Vibe. Its MCP servers live in TOML (`~/.vibe/config.toml`, the project's
 * `.vibe/config.toml`) and it has no listing command, so they are READ (`features/vibe`).
 * Its lever is `VIBE_MCP_SERVERS`, which outranks both files and is merged BY NAME — so each
 * of the user's servers is re-declared whole with `disabled = true`, beside ours.
 *
 * Three more doors carry tools that would bypass the mask, and are closed for the run:
 * Mistral-hosted connectors (`enable_connectors`, on by default — they run with the user's
 * account on Mistral's side), and the MCP servers that PLUGINS bring (Vibe loads its own and
 * Claude's/Codex's), whose tools are all published as `plugin_…` and switched off by pattern.
 * An agent profile outranks the variables: one that sets any of this blocks exclusivity.
 */
export const VIBE: AgentClient = {
  id: "vibe",
  list: (cwd, home) => vibeServers(readVibeFiles(cwd, process.env, {}, home)),
  exclusive: ({ url, env }) => {
    let files: VibeFiles;
    let tools: string[];
    try {
      files = readVibeFiles(process.cwd(), env);
      tools = userDisabledTools(env);
    } catch (err) {
      return { blocked: err instanceof Error ? err.message : String(err) };
    }
    const over = files.agents.filter((a) => AGENT_MCP_KEYS.some((k) => k in a.doc));
    if (over.length)
      return {
        blocked:
          `${over.map((a) => a.path).join(", ")} sets its own MCP servers or tools, and an agent ` +
          "profile outranks the proxy — move those keys into config.toml for this run",
      };
    const bare = (u: unknown) => String(u ?? "").split("?")[0];
    const theirs = (mergedByName(files.configs, "mcp_servers") as Entry[])
      .filter((e) => bare(e.url) !== bare(url) && e.name !== "openmasq")
      .map(stub);
    return {
      args: [],
      env: {
        VIBE_MCP_SERVERS: JSON.stringify([...theirs, ourEntry(url)]),
        VIBE_ENABLE_CONNECTORS: "false",
        VIBE_DISABLED_TOOLS: JSON.stringify([...tools, "plugin_*"]),
      },
    };
  },
};
