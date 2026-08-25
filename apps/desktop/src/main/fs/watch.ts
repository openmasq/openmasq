// The worker's directory watchers — what makes « le modèle écrit, vous voyez » true.
//
// A SET of directories, not one: the folder browser watches what you are navigating, and
// the open file watches its own folder, and those are routinely different (the panel
// survives leaving the Bibliothèque). One slot made the two fight, and the loser silently
// stopped refreshing — which reads exactly like "the model did nothing".
//
// Bounded on purpose: the renderer asks for a set, so the set is a resource. Beyond the cap
// the extra directories are DROPPED rather than watched, because an unbounded watcher count
// is a handle leak a renderer could drive.
import { watch, type FSWatcher } from "node:fs";

/** Coalesce a burst of raw fs events (an editor save fires several) into one push. */
const DEBOUNCE_MS = 150;
/** More than this and something is wrong with the caller, not with the user's disk. */
const MAX_WATCHED = 8;

const active = new Map<string, FSWatcher>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function stop(path: string): void {
  try {
    active.get(path)?.close();
  } catch {
    /* already gone */
  }
  active.delete(path);
  const t = timers.get(path);
  if (t) clearTimeout(t);
  timers.delete(path);
}

/**
 * Watch exactly `paths` (already grant-resolved by the caller) and nothing else — the call
 * is a full REPLACEMENT, so a caller that stops caring simply stops listing. Returns what
 * is actually being watched, so the renderer can tell when it asked for too many.
 *
 * A platform/permission failure is NOT an error the user needs: that directory just stops
 * refreshing on its own, and the manual refresh still works.
 */
export function setWatch(paths: string[], notify: (p: string) => void): string[] {
  const wanted = [...new Set(paths)].slice(0, MAX_WATCHED);
  for (const p of [...active.keys()]) if (!wanted.includes(p)) stop(p);
  for (const p of wanted) {
    if (active.has(p)) continue;
    try {
      const w = watch(p, { persistent: false, recursive: false }, () => {
        const prev = timers.get(p);
        if (prev) clearTimeout(prev);
        timers.set(
          p,
          setTimeout(() => {
            timers.delete(p);
            // Re-check: the watch may have been dropped while the debounce was pending,
            // in which case this burst belongs to a directory nobody is looking at.
            if (active.has(p)) notify(p);
          }, DEBOUNCE_MS),
        );
      });
      active.set(p, w);
    } catch {
      /* unwatchable (network share, permissions) — degrade to manual refresh */
    }
  }
  return [...active.keys()];
}

/** Tear every watcher down (worker shutdown / connection close). */
export function stopWatch(): void {
  for (const p of [...active.keys()]) stop(p);
}
