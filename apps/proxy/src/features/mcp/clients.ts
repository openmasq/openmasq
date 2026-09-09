// What each agent client needs so that OUR endpoint is the ONLY MCP it speaks to, and where
// it declares the servers we take over. Without the first half the feature is theatre: an
// agent that keeps its own MCP connections reaches Gmail directly, with its own credential,
// and nothing on that path is masked.
//
// Nothing here EDITS a user's configuration. Exclusivity is asked for on the command line,
// for the duration of one run, so quitting the proxy restores the client exactly as it was.
import { homedir } from "node:os";
import { basename, join } from "node:path";

/** Where a client declares its own MCP servers: a file, and the path to the map inside it. */
export interface Declaration {
  path: string;
  /** Keys to walk down to the `mcpServers` map (`["projects", cwd, "mcpServers"]`). */
  at: string[];
  /** What to call this source on screen. */
  scope: string;
}

export interface AgentClient {
  id: string;
  /** Flags that point the client at `configPath` and make it ignore every other MCP config. */
  exclusiveArgs(configPath: string): string[];
  /** Its own declarations, least specific first — a later one wins on the same id. */
  declarations(cwd: string, home: string): Declaration[];
}

/**
 * Claude Code. `--strict-mcp-config` is the client's own switch for "only the servers in
 * --mcp-config, ignore all other MCP configurations" — which is exactly the exclusivity this
 * needs, expressed by the client rather than imposed on its files.
 */
const CLAUDE: AgentClient = {
  id: "claude",
  exclusiveArgs: (configPath) => ["--mcp-config", configPath, "--strict-mcp-config"],
  declarations: (cwd, home) => [
    { path: join(home, ".claude.json"), at: ["mcpServers"], scope: "user" },
    { path: join(home, ".claude.json"), at: ["projects", cwd, "mcpServers"], scope: "local" },
    { path: join(cwd, ".mcp.json"), at: ["mcpServers"], scope: "project" },
  ],
};

const CLIENTS: AgentClient[] = [CLAUDE];

/**
 * Which client is being wrapped, by the command's own name. Unknown ⇒ undefined, and the
 * caller SAYS SO rather than assuming: for a client whose own MCP servers we cannot switch
 * off, the honest report is that its tool calls do not pass through here.
 */
export function detectClient(command: string): AgentClient | undefined {
  const name = basename(command).replace(/\.(cmd|exe|bat)$/i, "");
  return CLIENTS.find((c) => c.id === name);
}

export const CLIENT_IDS = CLIENTS.map((c) => c.id);

/** The one-server config handed to the client: our endpoint, and nothing else. */
export function soleServerConfig(url: string): string {
  return `${JSON.stringify({ mcpServers: { openmasq: { type: "http", url: `${url}/mcp` } } }, null, 2)}\n`;
}

/** Read a declaration's map out of a parsed document; undefined when the path is absent. */
export function pick(doc: unknown, at: string[]): unknown {
  let node: unknown = doc;
  for (const key of at) {
    if (typeof node !== "object" || node === null || Array.isArray(node)) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

export const defaultHome = homedir;
