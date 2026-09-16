// What each agent client needs so that OUR endpoint is the ONLY MCP it speaks to, and where
// it declares the servers we take over. Without the first half the feature is theatre: an
// agent that keeps its own MCP connections reaches the service directly, unmasked.
//
// Nothing here EDITS a user's configuration: exclusivity is asked for on the command line
// (or in a file of ours the client is pointed at for one run), so quitting restores the
// client exactly. One file per client, because the differences ARE the subject. A client
// that offers no such lever is deliberately absent — `start.ts` then says out loud that its
// tool calls do not pass through the mask. A variable that relocates the client's HOME is
// never the answer: it moves the credentials along with the settings.
import { homedir } from "node:os";
import { basename } from "node:path";
import { CLAUDE } from "./claude.js";
import { CODEX } from "./codex.js";
import { COPILOT } from "./copilot.js";
import { GEMINI } from "./gemini.js";
import { HERMES } from "./hermes.js";
import { OPENCODE } from "./opencode.js";
import type { AgentClient } from "./types.js";

export type {
  AgentClient,
  Declaration,
  Exclusivity,
  ExclusiveCtx,
  OwnServer,
} from "./types.js";
export { parseCodexList } from "./codex.js";
export { parseCopilotList } from "./copilot.js";
export { parseOpencodeConfig } from "./opencode.js";

const CLIENTS: AgentClient[] = [CLAUDE, CODEX, GEMINI, OPENCODE, COPILOT, HERMES];

/** The id our server is declared under, everywhere a client is handed one. */
export const OUR_ID = "openmasq";

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

/** The clients whose servers can be read from a FILE — what `mcp status` can list without
 *  running anybody's binary (a probe spawns the client, which a status command must not). */
export const DECLARING_CLIENTS = CLIENTS.filter((c) => c.declarations);

/** The one-server config handed to the client: our endpoint, and nothing else. */
export function soleServerConfig(endpoint: string): string {
  return `${JSON.stringify({ mcpServers: { [OUR_ID]: { type: "http", url: endpoint } } }, null, 2)}\n`;
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
