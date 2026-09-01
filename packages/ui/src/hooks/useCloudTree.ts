import { useCallback, useEffect, useMemo, useState } from "react";
import { useHost, type CloudSource, type LocalFsEntry } from "../host";
import { useLazyTree } from "./useLazyTree";

/**
 * Connected storages (Drive, OneDrive) browsed like local folders.
 *
 * The trick fits in one line: a provider id isn't a path, so we build a KEY
 * `"<source>|<id>"` and the shared tree has nothing more to know.
 * `folderTreeRows` uses it for opening, depth and the anti-loop guard exactly
 * like a disk path.
 *
 * No slot (web preview, mobile) or no connected account ⇒ no roots, so nothing
 * renders: the group stays the list of states the panel already showed.
 */

/** The key of a remote entry. Empty `folderId` = the account's root. */
export const cloudKey = (sourceId: string, folderId = ""): string => `${sourceId}|${folderId}`;

/** Undo a key — `folderId` is `null` at the root, which is what the host expects. */
export function parseCloudKey(key: string): { sourceId: string; folderId: string | null } {
  const cut = key.indexOf("|");
  const sourceId = cut < 0 ? key : key.slice(0, cut);
  const folderId = cut < 0 ? "" : key.slice(cut + 1);
  return { sourceId, folderId: folderId || null };
}

export function useCloudTree(active: boolean) {
  const host = useHost();
  const cloud = host.cloudFs;
  const [sources, setSources] = useState<CloudSource[]>([]);
  const [tick, setTick] = useState(0);

  // Connecting or disconnecting an account changes the list: same signal as for
  // local folders, so a newly-linked Drive appears without reopening the panel.
  useEffect(() => {
    // EXPLICIT `return`: it's the unsubscribe. In a concise arrow, the implicit
    // return accidentally becomes React's cleanup — and the day the API's return
    // type changes, it lands on the ErrorBoundary (`scripts/check-effect-returns.mjs`).
    return host.mcp?.onChanged?.(() => setTick((n) => n + 1));
  }, [host.mcp]);

  useEffect(() => {
    if (!active || !cloud) return;
    let alive = true;
    void cloud
      .sources()
      .then((r) => alive && setSources(r.sources))
      .catch(() => alive && setSources([]));
    return () => {
      alive = false;
    };
  }, [active, cloud, tick]);

  const roots = useMemo(() => sources.map((s) => cloudKey(s.id)), [sources]);

  const list = useCallback(
    async (key: string): Promise<LocalFsEntry[]> => {
      if (!cloud) return [];
      const { sourceId, folderId } = parseCloudKey(key);
      const { entries } = await cloud.list(sourceId, folderId);
      // The row shape is the tree's: `path` carries the key, `size` is unknown and
      // is 0 — the row then shows no metadata rather than inventing some.
      return entries.map((e) => ({
        name: e.name,
        path: cloudKey(sourceId, e.id),
        kind: e.kind,
        size: 0,
        mtime: e.mtime,
      }));
    },
    [cloud],
  );

  const tree = useLazyTree({ active, roots, list });

  const refresh = useCallback(() => {
    setTick((n) => n + 1);
    tree.refresh();
  }, [tree]);

  return { sources, rows: tree.rows, toggle: tree.toggle, error: tree.error, refresh };
}
