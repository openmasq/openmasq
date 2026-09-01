/**
 * DISCOVER a remote server's listing tool — the half that invents nothing.
 *
 * The tool's NAME is allow-listed: a server doesn't get this path because it claims
 * to be storage, but because it exposes a tool whose name is on the list. Everything
 * else it exposes — writes included — is unreachable from here. The folder argument is
 * also allow-listed, and it is chosen FROM the declared schema, never guessed.
 */
import type { McpConnection, McpTool } from "@openmasq/mcp";

/** `dropbox__ListFolder` → `listfolder`: the instance prefix and the case are not
 *  information, only the tool's name is. */
const norm = (name: string): string => {
  const bare = name.includes("__") ? name.slice(name.lastIndexOf("__") + 2) : name;
  return bare.toLowerCase().replace(/[^a-z]/g, "");
};

/** ALLOW-LIST — list a folder's contents, and nothing else. */
const LIST_TOOLS = new Set(["listfolder", "listfolders", "listfiles", "listdirectory", "listdir"]);

/** ALLOW-LIST — the argument that names the folder to list. */
const FOLDER_ARGS = new Set(["path", "folder", "folderpath", "folderid", "directory", "dir"]);

/** ALLOW-LIST — the pagination argument, when the tool declares one. */
const CURSOR_ARGS = new Set(["cursor", "pagetoken", "nexttoken", "continuationtoken"]);

/** Is this tool name a folder listing? The question `cloudSources()` asks the
 *  ROUTING table already in memory, so it only announces as browsable an account that
 *  actually is — without a network round trip per row. */
export const isFolderListTool = (name: string): boolean => LIST_TOOLS.has(norm(name));

export interface FolderListTool {
  /** The tool's REAL name on the server (unprefixed). */
  tool: string;
  /** The argument carrying the folder. */
  folderArg: string;
  /** The pagination argument, if the tool declares one. */
  cursorArg?: string;
}

type Schema = { properties?: Record<string, unknown>; required?: unknown };

/**
 * A server's listing tool, or `null` if it exposes none that's usable.
 *
 * "Usable" excludes a tool requiring an argument we don't know how to fill:
 * calling it halfway would produce a server error where "this account can't be browsed"
 * is the honest answer.
 */
export function findFolderListTool(tools: McpTool[]): FolderListTool | null {
  for (const t of tools) {
    if (!LIST_TOOLS.has(norm(t.name))) continue;
    const schema = (t.inputSchema ?? {}) as Schema;
    const props = Object.keys(schema.properties ?? {});
    const folderArg = props.find((p) => FOLDER_ARGS.has(norm(p)));
    if (!folderArg) continue;
    const cursorArg = props.find((p) => CURSOR_ARGS.has(norm(p)));
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    const unfillable = required.filter((r) => r !== folderArg && r !== cursorArg);
    if (unfillable.length) continue;
    return { tool: t.name, folderArg, ...(cursorArg ? { cursorArg } : {}) };
  }
  return null;
}

const listerCache = new WeakMap<McpConnection, FolderListTool | null>();

/** A connection's listing tool, memoized — a reconnect creates a different object,
 *  so the cache empties itself when the connection changes. */
export async function listToolFor(conn: McpConnection): Promise<FolderListTool | null> {
  const hit = listerCache.get(conn);
  if (hit !== undefined) return hit;
  const found = findFolderListTool(await conn.listTools());
  listerCache.set(conn, found);
  return found;
}
