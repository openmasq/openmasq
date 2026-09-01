import type { LocalFsHost } from "../../host";

/**
 * ONE watch call, several subscribers.
 *
 * The platform takes a SET of directories and replaces it wholesale, so two independent
 * views — the folder finder and the open file's panel, which routinely sit on different
 * folders and outlive each other — cannot each call `watch()` without erasing the other's
 * request. The loser then silently stops refreshing, which reads exactly like « le modèle
 * n'a rien fait ». This registry owns the call: subscribers declare a directory, it sends
 * the union, and it fans each event back only to whoever asked for that directory.
 *
 * Module-level, not a React context: the panel survives leaving the Bibliothèque, so the
 * registry must outlive any one tree.
 */
type Sub = { dir: string; onChange: () => void };

const subs = new Set<Sub>();
let host: LocalFsHost | null = null;
let unsubscribe: (() => void) | null = null;

/** Push the union of what everyone wants. Best-effort: an unwatchable directory just
 *  stops refreshing on its own, and the manual refresh still works. */
function sync(): void {
  const fs = host;
  if (!fs?.watch) return;
  void fs.watch([...new Set([...subs].map((s) => s.dir).filter(Boolean))]).catch(() => {});
}

function ensureBridge(fs: LocalFsHost): void {
  if (host === fs && unsubscribe) return;
  unsubscribe?.();
  host = fs;
  unsubscribe =
    fs.onChanged?.((changed) => {
      // Fan out by directory: a change in the browsed folder must not force the open
      // file to re-read, and vice versa.
      for (const s of subs) if (s.dir === changed) s.onChange();
    }) ?? null;
}

/**
 * Watch `dir` until the returned function is called. `dir` empty ⇒ nothing is watched for
 * this subscriber (it still counts as registered, so unsubscribing stays symmetric).
 */
export function watchDir(fs: LocalFsHost, dir: string, onChange: () => void): () => void {
  ensureBridge(fs);
  const sub: Sub = { dir, onChange };
  subs.add(sub);
  sync();
  return () => {
    subs.delete(sub);
    sync();
    if (subs.size === 0) {
      unsubscribe?.();
      unsubscribe = null;
      host = null;
    }
  };
}

/** Test-only: forget every subscriber (the registry is module state). */
export function _resetWatchDirs(): void {
  subs.clear();
  unsubscribe?.();
  unsubscribe = null;
  host = null;
}
