import type { McpConnection, McpToolResult } from "@openmasq/mcp";
import { sortRemote, type RemoteEntry } from "@openmasq/connectors";
import { listerFor, } from "./lister";
import { asRecord, describeShape, parseToolList, } from "./read";

/**
 * Browse a storage whose call we do NOT write — a remote MCP server
 * (Dropbox) — going through the listing tool it exposes itself.
 *
 * Drive and OneDrive are DIRECT connectors: we build the URL, so the shape
 * of the response is a contract we hold (`cloudfs/providers.ts`). Dropbox is only
 * reachable via `https://mcp.dropbox.com/mcp`, and its `ListFolder` is the only
 * listing that exists. Hence this module's posture, which is the opposite of guessing:
 *
 *  - **`lister.ts` guesses nothing**: tool name and folder argument in an allow-list, the
 *    second chosen FROM the declared schema. Everything else the server exposes —
 *    writes included — is unreachable from here.
 *  - **`read.ts` fails CLOSED**: JSON, and only if it carries enough to name AND classify
 *    each entry. Otherwise the source reverts to its status line, with the FOOTPRINT of what was
 *    received (keys, never values) — a refusal with no diagnostic is a wall.
 *
 * ⚠️ What this does NOT widen: read-only, no byte of content, no scope beyond
 * those already granted to the connection. The renderer can already call
 * `mcp.callTool("dropbox__ListFolder")` and get the real names back — what changes here is
 * the SHAPE (typed for a UI), not the scope.
 */

/** A folder identifier comes from the RENDERER. It composes no URL here — it becomes
 *  a JSON argument the server interprets — so the guard is a hygiene floor:
 *  bounded, no control character. The root is the empty string, which is what Dropbox expects. */
export function assertFolderRef(ref: string | null): string {
  const s = ref ?? "";
  if (s.length > 1024) throw new Error("Chemin de dossier trop long.");
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(s)) throw new Error("Chemin de dossier invalide.");
  return s;
}

/** Pagination bounds: enough to cover a real folder without looping on a server
 *  that would always return `has_more`. Reaching the bound TRUNCATES — it's the one place
 *  where the list can be incomplete, and it's stated here rather than silent. */
const MAX_PAGES = 20;
const MAX_ENTRIES = 2000;

/** The TEXT parts of a result — including those a server wraps as `resource`,
 *  which is the same text under another name. */
const textsOf = (content: McpToolResult["content"]): string[] =>
  content.flatMap((c) => {
    if (c.type === "text" && typeof c.text === "string") return [c.text];
    const res = c.type === "resource" ? asRecord((c as { resource?: unknown }).resource) : null;
    return typeof res?.text === "string" ? [res.text] : [];
  });

/** The folder of a PATH-shaped identifier (`/a/b.pdf` → `/a`, the root → `/`). */
const parentOf = (p: string): string => p.slice(0, p.lastIndexOf("/")) || "/";

/**
 * Keep only the DIRECT children of the requested folder.
 *
 * ⚠️ A remote `ListFolder` can answer RECURSIVELY: the grandchild then arrives right
 * next to its parent, in the same listing. The tree renders whatever it's given — so the file
 * would show up at the root AND in its folder, and collapsing the folder removed nothing
 * since the other row didn't depend on it. This is where it gets cut, not on screen:
 * a listing must describe ONE folder.
 *
 * Applies only to PATH-shaped identifiers — a Drive fileId or a Graph itemId
 * is opaque, nothing can be inferred from it, so it's left untouched.
 */
export function directChildren(folder: string, entries: readonly RemoteEntry[]): RemoteEntry[] {
  const base = folder === "" || folder === "/" ? "/" : folder.replace(/\/+$/, "");
  return entries.filter((e) => !e.id.startsWith("/") || parentOf(e.id) === base);
}

/** A remote folder's content, via the server's tool. Throws when it isn't
 *  readable: the caller turns that into "this storage can't be browsed". */
export async function mcpBrowseList(
  conn: McpConnection,
  folderRef: string | null,
): Promise<RemoteEntry[]> {
  const lister = await listerFor(conn);
  if (!lister) throw new Error("Ce stockage n'expose pas de listage de dossier.");
  const folder = assertFolderRef(folderRef);
  const entries: RemoteEntry[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    // The folder ALWAYS accompanies the cursor: a tool whose path is mandatory
    // would refuse a follow-up page carrying only the cursor.
    const args: Record<string, string> = { [lister.folderArg]: folder };
    if (cursor && lister.cursorArg) args[lister.cursorArg] = cursor;
    const res = await conn.callTool({ name: lister.tool, arguments: args });
    if (res.isError) throw new Error("Ce dossier n'a pas pu être listé.");
    const texts = textsOf(res.content);
    const parsed = parseToolList(texts);
    // The footprint accompanies the refusal: without it, nobody can know WHAT is missing.
    if (!parsed) throw new Error(`Ce stockage ne rend pas de liste exploitable — ${describeShape(texts)}.`);
    let neuf = 0;
    for (const e of directChildren(folder, parsed.entries)) {
      // An identifier already seen doesn't get added twice — a server that IGNORES our
      // cursor would otherwise re-serve the same page twenty times, as duplicates.
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      entries.push(e);
      neuf++;
    }
    cursor = parsed.cursor;
    // A page that brings NOTHING new stops the pagination: that's the signature of an
    // ignored cursor, and insisting would only repay the same round trip.
    if (!cursor || !lister.cursorArg || !neuf || entries.length >= MAX_ENTRIES) break;
  }
  return sortRemote(entries.slice(0, MAX_ENTRIES));
}

// What the barrel REALLY exposes: the rest is imported directly from
// `./lister` / `./read` by its consumers, and re-exporting it would only create
// unreachable code.
export { findFolderLister, isFolderListTool } from "./lister";
export { describeShape, parseToolList } from "./read";
