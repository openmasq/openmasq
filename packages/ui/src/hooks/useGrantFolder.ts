import { useCallback, useState } from "react";
import { useHost, type McpHost } from "../host";
import { FILESYSTEM_CONNECTOR_ID, localServerId } from "../state/conversation/mcpIds";

/**
 * Grant ONE more local folder to the Filesystem connector — the gesture behind the
 * rail's « + » on « Dossiers » AND the composer's « + » → Dossier. One home (rule 9):
 * the two doors must install, reconnect and extend the same server the same way.
 *
 * A NEW folder can only come from the NATIVE picker: the host checks it on the
 * privileged side, the renderer cannot assign itself a path (`main/fs/CLAUDE.md`).
 * Four things a shortcut misses here, which make a button that "does nothing":
 *  · the targeted server is `local-filesystem`, not `filesystem` (`state/mcpIds.ts`);
 *  · the LIST starts from what the server actually has registered — `setDirs` replaces,
 *    so sending only the new path would silently revoke the others;
 *  · a refusal comes back in `info.error`, it is NOT thrown: without reading it, the
 *    failure exists nowhere on screen;
 *  · and the connector may not be connected at all — that's even the default state
 *    of a fresh install, the one where this button gets clicked the most.
 */
type GrantFolderOutcome =
  /** The picker was cancelled, or the folder was already granted — nothing changed. */
  | { granted: false; error?: undefined }
  | { granted: false; error: string }
  | { granted: true; error?: undefined };

/** What the gesture needs of the host — `setDirs` made mandatory: without it there is
 *  no gesture at all (`canAdd` is false and the button is not drawn). */
export type GrantHost = Pick<McpHost, "pickDir" | "list" | "addStdio" | "connect"> & {
  setDirs: NonNullable<McpHost["setDirs"]>;
};

/** The pure core: pick, then install / reconnect / extend. `knownRoots` is the
 *  renderer's view of the grants, used only when the server reports no param list. */
export async function grantPickedFolder(
  mcp: GrantHost,
  knownRoots: readonly string[],
): Promise<GrantFolderOutcome> {
  const serverId = localServerId(FILESYSTEM_CONNECTOR_ID);
  const server = (await mcp.list()).find((s) => s.id === serverId);
  // The param key comes from the server itself when it exists; otherwise `root`,
  // which is what main's catalog declares (`mcp/catalog.ts`).
  const key = server ? (Object.keys(server.params ?? {})[0] ?? "root") : "root";
  const current: string[] = server ? (server.params?.[key] ?? [...knownRoots]) : [];

  // ⚠️ THE PICKER FIRST, even with no connector. The folder isn't a connector
  // setting: it IS the AUTHORIZATION itself, and the server refuses to be
  // registered without it (« Dossiers autorisés requis » — `root` is required). Trying
  // to install it empty to "fix" it before asking therefore always fails.
  const picked = await mcp.pickDir();
  if (!picked || current.includes(picked)) return { granted: false };

  // Connector absent ⇒ install it WITH the folder that was just granted, then
  // connect it. The user has nothing to connect themselves: they chose a
  // folder, the integration sets itself up behind the scenes. Nothing is authorized
  // along the way — the root stays what the NATIVE dialog returned.
  if (!server) {
    const added = await mcp.addStdio(FILESYSTEM_CONNECTOR_ID, {}, { [key]: [picked] });
    if (added?.error) return { granted: false, error: added.error };
    const started = await mcp.connect(serverId);
    return started?.error ? { granted: false, error: started.error } : { granted: true };
  }
  // Registered but off: reconnect it, otherwise `setDirs` would write into the void.
  if (server.connected === false) {
    const started = await mcp.connect(serverId);
    if (started?.error) return { granted: false, error: started.error };
  }
  const info = await mcp.setDirs(server.id, key, [...current, picked]);
  return info?.error ? { granted: false, error: info.error } : { granted: true };
}

/**
 * The React face: capability, busy state, the last error, and the gesture. `roots`
 * is the caller's tree when it has one (the rail); `onGranted` lets it refresh
 * right away — every other reader re-lists on `host.mcp.onChanged` anyway.
 */
export function useGrantFolder(
  opts: { roots?: readonly string[]; onGranted?: () => void } = {},
): { canAdd: boolean; adding: boolean; error: string; addFolder: () => Promise<void> } {
  const mcp = useHost().mcp;
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const canAdd = !!mcp?.pickDir && !!mcp?.setDirs;
  const { roots, onGranted } = opts;

  const addFolder = useCallback(async () => {
    const setDirs = mcp?.setDirs;
    if (!mcp?.pickDir || !setDirs || adding) return;
    setAdding(true);
    setError("");
    try {
      // Method calls, not a spread: a host slot may rely on its own `this`.
      const out = await grantPickedFolder(
        {
          pickDir: (hint) => mcp.pickDir(hint),
          list: () => mcp.list(),
          addStdio: (id, env, params) => mcp.addStdio(id, env, params),
          connect: (id) => mcp.connect(id),
          setDirs: (id, key, dirs) => setDirs.call(mcp, id, key, dirs),
        },
        roots ?? [],
      );
      if (out.error) setError(out.error);
      else if (out.granted) onGranted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }, [mcp, adding, roots, onGranted]);

  return { canAdd, adding, error, addFolder };
}
