import { useEffect, useState } from "react";
import { useHost } from "../../../host";

/**
 * The GRANTED local-fs roots, renderer-side — feeds the per-path « ouvrir » gate of
 * `fileOpenApi` (a pure `rootOf` check per mark, ZERO IPC per mark). Mirrors
 * the old `useLocalFsAvailable`: fetched once, re-asked on `host.mcp.onChanged` (granting a
 * folder in Réglages rebuilds the connection). ⚠️ That hook is now `useLocalFsCapable.ts`
 * and answers a DIFFERENT question (the platform's capability, not the grants) — it no
 * longer calls `roots()` at all, so this file is the only renderer-side reader left.
 * `[]` covers "no capability", "nothing granted" and "fetch failed" alike — the
 * affordance simply doesn't draw. Never a probe per path: an automatic stat() of every
 * path in a reply would be a fake→real existence oracle (the MarkdownLink rule).
 */
export function useLocalFsRoots(): readonly string[] {
  const host = useHost();
  const fs = host.localFs;
  const [roots, setRoots] = useState<readonly string[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    return host.mcp?.onChanged?.(() => setTick((n) => n + 1)); // l'unsubscribe
  }, [host.mcp]);
  useEffect(() => {
    if (!fs) return;
    let alive = true;
    void fs
      .roots()
      .then((r) => alive && setRoots(r.available ? r.roots : []))
      .catch(() => alive && setRoots([]));
    return () => {
      alive = false;
    };
  }, [fs, tick]);
  return roots;
}
