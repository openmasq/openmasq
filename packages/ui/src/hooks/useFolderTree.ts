import { useCallback, useEffect, useState } from "react";
import { useHost } from "../host";
import { watchDir } from "../state/files/watchDirs";
import { useLazyTree } from "./useLazyTree";

/**
 * The folders GRANTED on this machine, as a tree — the rail's « Dossiers » panel.
 *
 * Everything shared with connected storage (expand/collapse, lazy reading, the
 * anti-loop guard) lives in `useLazyTree`. All that remains here belongs
 * only to local: the roots the connector granted, and disk WATCHING —
 * a remote folder doesn't notify when it changes, this one does.
 */
export function useFolderTree(active: boolean) {
  const host = useHost();
  const fs = host.localFs;
  const [roots, setRoots] = useState<string[]>([]);
  const [tick, setTick] = useState(0);

  const list = useCallback(
    async (path: string) => {
      if (!fs) return [];
      return (await fs.list(path)).entries;
    },
    [fs],
  );
  const tree = useLazyTree({ active, roots, list });

  // A folder granted or revoked in Réglages rebuilds the connection: we re-read the
  // roots on this signal, so a folder just authorized appears without reopening anything.
  useEffect(() => {
    return host.mcp?.onChanged?.(() => setTick((n) => n + 1)); // the unsubscribe, explicit
  }, [host.mcp]);

  useEffect(() => {
    if (!active || !fs) return;
    let alive = true;
    void fs
      .roots()
      .then((r) => alive && setRoots(r.available ? r.roots : []))
      .catch(() => alive && setRoots([]));
    return () => {
      alive = false;
    };
  }, [active, fs, tick]);

  // Watch every OPEN folder — via the shared registry, because the Bibliothèque's
  // Finder and the open-file panel watch theirs at the same time and
  // the platform call replaces the whole set (`state/watchDirs.ts`).
  const watchKey = [...tree.expanded].sort().join("\u0000");
  const { dropListing } = tree;
  useEffect(() => {
    if (!active || !fs || !watchKey) return;
    const stops = watchKey.split("\u0000").map((dir) => watchDir(fs, dir, () => dropListing(dir)));
    return () => stops.forEach((stop) => stop());
  }, [active, fs, watchKey, dropListing]);

  const refresh = useCallback(() => {
    setTick((n) => n + 1);
    tree.refresh();
  }, [tree]);

  return { roots, rows: tree.rows, toggle: tree.toggle, error: tree.error, refresh };
}
