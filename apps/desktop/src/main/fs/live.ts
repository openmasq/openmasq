import type { LocalFsConnection } from "./connection";

/**
 * The live filesystem connection, so the folder-browser IPC can reach it without
 * reading the MCP registry's connection map. Two reasons that indirection is worth a
 * module: the fs family stays self-contained (rule 10 — its gate, its worker and its
 * two entry points read together), and the browser's availability is then EXACTLY
 * "the Filesystem connector is connected" — there is no second notion of a grant.
 *
 * Set by `mcp/server/connect.ts` when it constructs the connection; cleared by
 * `LocalFsConnection.close()`, so a disconnect can't leave a dangling handle whose
 * worker is already dead.
 */
let live: LocalFsConnection | null = null;

export function setLiveFs(conn: LocalFsConnection): void {
  live = conn;
}

/** Clear only if `conn` is still the live one — a reconnect installs the new
 *  connection before the old one finishes closing. */
export function clearLiveFs(conn: LocalFsConnection): void {
  if (live === conn) live = null;
}

/** The live connection, or null when the connector isn't connected (no grants ⇒ the
 *  UI hides the folder browser entirely rather than showing an empty one). */
export function getLiveFs(): LocalFsConnection | null {
  return live;
}
