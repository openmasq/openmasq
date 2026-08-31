import type { Messages } from "@openmasq/i18n";
import type { McpHost, McpServerInfo } from "../../host";

/**
 * Authorising a folder the user dropped on a conversation.
 *
 * The decision flow only; the component that offers it is `DropZone.tsx` and the
 * classification is `dropIntake.ts`. Pure but for the injected host, so every branch —
 * and above all the refusal branches — is testable.
 *
 * ## The one thing that must not change
 *
 * ⚠️ **The grant is what `pickDir` RETURNS, never what was dropped.** The dropped path is
 * passed in as a `hint` and its only effect is to open the system dialog on that folder.
 * `mcp/stdioDirs.test.ts` pins the privileged side of this: a NEW root must come from that
 * dialog in the current session. If this function ever passes the hint on to `setDirs`
 * instead of the picked path, a renderer XSS grants itself any folder on the disk — the
 * exact hole the native-picker rule exists to close.
 */

/** The CATALOG id of the Filesystem connector (what `addStdio` takes) and its param key. */
export const FS_CONNECTOR_ID = "filesystem";
export const FS_DIRS_KEY = "root";

/**
 * ⚠️ The catalog id is NOT the server id. `mcpAddStdio` registers a stdio entry as
 * `local-<catalogId>`, so `connect`/`setDirs` keyed on the catalog id answer
 * « unknown server » — which is exactly what a live drop reported. The lookup therefore
 * accepts BOTH spellings and every later call uses the id the host actually gave us,
 * never a reconstructed one.
 */
export function isFsServerId(id: string): boolean {
  return id === FS_CONNECTOR_ID || id === `local-${FS_CONNECTOR_ID}`;
}

export type GrantOutcome =
  | { status: "granted"; path: string }
  | { status: "already"; path: string }
  | { status: "cancelled" }
  | { status: "unavailable" }
  | { status: "error"; message: string };

interface GrantDeps {
  mcp: McpHost | undefined;
  /** The connectors as the app currently knows them (`host.mcp.list()`), so the flow can
   *  tell "add the connector" from "widen its scope". */
  servers: readonly McpServerInfo[];
  /** Called after a successful grant so the surrounding UI re-reads the connector list. */
  onChanged?: () => void;
}

function findFs(servers: readonly McpServerInfo[]): McpServerInfo | undefined {
  return servers.find((s) => isFsServerId(s.id));
}

/**
 * Offer the system dialog for `hint`, then widen the Filesystem connector's scope with
 * whatever the user actually picked.
 *
 * Refusals are distinct on purpose: a cancelled dialog is not an error and must not raise
 * a banner, an unavailable platform is not a failure the user can act on, and a folder
 * already in scope should say so rather than silently doing nothing.
 */
export async function grantDroppedFolder(
  deps: GrantDeps,
  hint: string | undefined,
  t: Messages,
): Promise<GrantOutcome> {
  const mcp = deps.mcp;
  if (!mcp?.pickDir) return { status: "unavailable" };

  let picked: string | undefined;
  try {
    picked = await mcp.pickDir(hint);
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : t.conversation.folderPickFailed };
  }
  // Cancelled: the user opened the dialog and declined. Not an error, no banner.
  if (!picked) return { status: "cancelled" };

  const existing = findFs(deps.servers);
  const dirs = existing?.params?.[FS_DIRS_KEY] ?? [];
  if (dirs.includes(picked)) return { status: "already", path: picked };

  try {
    // Already installed ⇒ widen its scope, keyed on the id the HOST reports. `setDirs`
    // REPLACES the set, so the existing roots must be carried over — dropping them would
    // silently revoke folders the user granted earlier, the opposite of what they asked.
    if (existing) {
      if (!mcp.setDirs) return { status: "unavailable" };
      const info = await mcp.setDirs(existing.id, FS_DIRS_KEY, [...dirs, picked]);
      if (info.error) return { status: "error", message: info.error };
    } else {
      // Not installed yet: add it WITH this folder as its only root, then connect. The
      // narrow initial scope is the point — the drop authorises one folder, not the disk.
      // `addStdio` takes the CATALOG id and answers with the SERVER id; connect on that.
      const added = await mcp.addStdio(FS_CONNECTOR_ID, {}, { [FS_DIRS_KEY]: [picked] });
      if (added.error) return { status: "error", message: added.error };
      const connected = await mcp.connect(added.id);
      if (connected.error) return { status: "error", message: connected.error };
    }
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : t.conversation.folderGrantFailed };
  }

  deps.onChanged?.();
  return { status: "granted", path: picked };
}

/** What the user is told afterwards. `cancelled` is deliberately silent. */
export function grantMessage(outcome: GrantOutcome): string | null {
  switch (outcome.status) {
    case "granted":
      return `Dossier autorisé : ${outcome.path}`;
    case "already":
      return `Ce dossier est déjà autorisé : ${outcome.path}`;
    case "unavailable":
      return "Les dossiers locaux ne sont pas disponibles sur cette plateforme.";
    case "error":
      return `Autorisation refusée : ${outcome.message}`;
    case "cancelled":
      return null;
  }
}
