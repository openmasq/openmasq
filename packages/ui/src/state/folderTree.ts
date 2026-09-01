import type { LocalFsEntry } from "../host";
import { rootEntries, visibleEntries } from "./localFsPaths";

/**
 * The granted folders as a TREE — the flattening the right rail renders, kept pure so the
 * one thing that can loop for ever is testable.
 *
 * Why a tree here when the Bibliothèque browses the same grants as miller COLUMNS: the
 * rail is ~214px wide and sits beside a conversation, so a column control has nowhere to
 * grow sideways. Same data, same grants, same host — a second SHAPE, not a second source.
 *
 * Nothing here decides access: every path goes back to main, which re-resolves it against
 * the grant (`host/localFs.ts`).
 */

export interface FolderTreeRow {
  /** The render key — UNIQUE, unlike the path (see the warning below).
   *  Opaque: nothing should deconstruct it, it's only for `key=`. */
  key: string;
  entry: LocalFsEntry;
  /** 0 = a granted root; +1 per nesting level. Drives the indent alone. */
  depth: number;
  /** A directory the user opened. Files are never expanded. */
  expanded: boolean;
  /** Expanded, but its listing hasn't arrived — the row says so rather than reading as
   *  an empty folder. */
  loading: boolean;
  /** Its read FAILED. Distinct from `loading`: a folder whose listing failed used to stay
   *  on « … » forever, which reads as a slow load — so as a folder that doesn't render
   *  its children, whereas a failure has a cause and a remedy. */
  failed: boolean;
}

/**
 * How deep the rail will render. A guard, not a preference: the ancestor check below
 * already stops the symlink loop that can be expressed as a cycle, and this bounds the
 * pathological-but-acyclic case (a 300-deep node_modules) before it becomes 300 rows of
 * 4px indents.
 */
export const MAX_TREE_DEPTH = 12;

/**
 * Flatten the open parts of the tree into rows, in render order.
 *
 * ⚠️ **A directory is never expanded inside itself.** Expansion state is keyed by absolute
 * path, and a symlinked subfolder pointing at an ancestor resolves to that ancestor's path
 * — so expanding it would mark the ancestor expanded too and the walk would recurse until
 * the stack blew. Carrying the ancestor chain is what makes the loop unrenderable rather
 * than merely unlikely; `folderTree.test.ts` pins it.
 *
 * ⚠️ **Every row carries a UNIQUE `key`, and the path is not one.** The same path can
 * legitimately appear twice — the link to an ancestor above is a WANTED case of that
 * (the row shows, collapsed) — and a remote storage can return a RECURSIVE listing,
 * where the grandchild arrives next to its parent. Rendering two rows under the same
 * React key is what made a folder impossible to CLOSE: collapsing no longer removed
 * anything and re-expanding duplicated. The key is therefore the CHAIN of ancestors +
 * the path, unique by construction; and a listing that repeats an entry only renders one. `folderTree.test.ts`.
 */
export function folderTreeRows(
  roots: readonly string[],
  listings: Readonly<Record<string, readonly LocalFsEntry[]>>,
  expanded: ReadonlySet<string>,
  pending: ReadonlySet<string> = new Set(),
  failed: ReadonlySet<string> = new Set(),
): FolderTreeRow[] {
  const rows: FolderTreeRow[] = [];

  const walk = (entries: readonly LocalFsEntry[], depth: number, ancestors: readonly string[]) => {
    // A listing that repeats an entry only renders one: two identical rows under the
    // same parent are not a wanted case, unlike the link to an ancestor.
    const here = new Set<string>();
    for (const entry of entries) {
      if (here.has(entry.path)) continue;
      here.add(entry.path);
      const isDir = entry.kind === "dir";
      const open = isDir && expanded.has(entry.path) && !ancestors.includes(entry.path);
      const known = entry.path in listings;
      const broke = open && failed.has(entry.path);
      rows.push({
        // NUL as separator: no path contains one, so two different ancestor chains
        // cannot be confused with each other.
        key: [...ancestors, entry.path].join("\u0000"),
        entry,
        depth,
        expanded: open,
        // A failed folder no longer "loads": otherwise the row promises an arrival that
        // will never come, and the user waits for content instead of reading the cause.
        loading: !broke && open && (!known || pending.has(entry.path)),
        failed: broke,
      });
      if (open && known && depth + 1 < MAX_TREE_DEPTH) {
        walk(visibleEntries(listings[entry.path]), depth + 1, [...ancestors, entry.path]);
      }
    }
  };

  walk(rootEntries(roots), 0, []);
  return rows;
}

/** Open ⇄ close one directory. Returns a NEW set (the caller stores it in state). */
export function toggleFolder(expanded: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(expanded);
  if (!next.delete(path)) next.add(path);
  return next;
}

/**
 * The directories whose listing the tree still needs — what the hook must fetch after a
 * change. Derived from the ROWS, so a folder that is expanded but hidden under a collapsed
 * parent (or cut off by the depth guard) is never fetched: the rail would pay for a
 * listing nothing can show.
 */
export function missingListings(
  rows: readonly FolderTreeRow[],
  listings: Readonly<Record<string, readonly LocalFsEntry[]>>,
): string[] {
  return rows
    .filter((r) => r.expanded && !r.failed && !(r.entry.path in listings))
    .map((r) => r.entry.path);
}
