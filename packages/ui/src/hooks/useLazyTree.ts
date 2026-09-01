import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LocalFsEntry } from "../host";
import { folderTreeRows, missingListings, toggleFolder } from "../state/files/folderTree";

/**
 * A tree that reads ONLY what gets opened — the mechanics shared by this machine's
 * folders and connected storages.
 *
 * The two sources differ by exactly one thing (how a folder is listed), and by
 * nothing else: same roots, same expansion, same "read once then keep". Writing
 * two copies means reproducing the traps below twice — including the one that
 * already cost an infinite loop.
 *
 * ⚠️ `requestedRef` is what prevents the loop: reading sets `pending`, `pending`
 * feeds the rows, the rows say what's missing — so a folder still in flight would
 * be re-requested on the re-render its own request caused. The effect also fires
 * on a KEY (a string), because a new array of the same paths is a different
 * dependency on every render.
 */
export function useLazyTree({
  active,
  roots,
  list,
}: {
  active: boolean;
  /** The roots, already resolved by the caller (paths or composite keys). */
  roots: readonly string[];
  /** List a folder. Must THROW on failure — an unreadable folder must never
   *  render as an empty folder. */
  list: (path: string) => Promise<LocalFsEntry[]>;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [listings, setListings] = useState<Record<string, LocalFsEntry[]>>({});
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  // Folders whose read FAILED. Without this set, the row stayed "…" forever: a
  // failure read as a slow load, hence as a folder that renders no children —
  // when a failure has a cause, shown right below.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const reqRef = useRef(0);
  const requestedRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  /** Forget ONE folder (the disk changed) — it will be re-read if still open. */
  const dropListing = useCallback((path: string) => {
    requestedRef.current.delete(path);
    setFailed((cur) => {
      if (!cur.has(path)) return cur;
      const next = new Set(cur);
      next.delete(path);
      return next;
    });
    setListings((cur) => {
      if (!(path in cur)) return cur;
      const next = { ...cur };
      delete next[path];
      return next;
    });
  }, []);

  useEffect(() => {
    if (tick === 0) return;
    reqRef.current++;
    requestedRef.current.clear();
    setListings({});
    setFailed(new Set());
    setError("");
  }, [tick]);

  const rows = useMemo(
    () => folderTreeRows(roots, listings, expanded, pending, failed),
    [roots, listings, expanded, pending, failed],
  );

  const wanted = useMemo(
    () => missingListings(rows, listings).filter((p) => !requestedRef.current.has(p)),
    [rows, listings],
  );
  // NUL as separator, never a space: a folder is commonly named "Mes
  // Documents", and splitting the key on spaces would produce two nonexistent paths.
  const wantedKey = wanted.join("\u0000");
  useEffect(() => {
    if (!active || !wantedKey) return;
    const paths = wantedKey.split("\u0000");
    paths.forEach((p) => requestedRef.current.add(p));
    setPending((cur) => new Set([...cur, ...paths]));
    const id = ++reqRef.current;
    void (async () => {
      for (const path of paths) {
        try {
          const entries = await list(path);
          if (id !== reqRef.current) return;
          setListings((cur) => ({ ...cur, [path]: entries }));
        } catch (e) {
          if (id !== reqRef.current) return;
          // Honest: folder removed, disk unplugged, permission revoked, account
          // disconnected. The listing stays ABSENT (so not "empty"), and the path
          // leaves the requested set so a « Réessayer » actually re-reads.
          requestedRef.current.delete(path);
          setFailed((cur) => new Set([...cur, path]));
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          setPending((cur) => {
            const next = new Set(cur);
            next.delete(path);
            return next;
          });
        }
      }
    })();
    // `list` is not in the dependencies ON PURPOSE: the caller recreates it on every
    // render, and the key already says exactly what's left to read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, wantedKey]);

  /** Collapsing then re-expanding is the natural "retry": the failure is forgotten here, so
   *  the read starts over for real instead of re-rendering the old verdict. */
  const toggle = useCallback((path: string) => {
    setError("");
    setFailed((cur) => {
      if (!cur.has(path)) return cur;
      const next = new Set(cur);
      next.delete(path);
      return next;
    });
    setExpanded((cur) => toggleFolder(cur, path));
  }, []);

  return { rows, expanded, toggle, error, refresh, dropListing };
}
