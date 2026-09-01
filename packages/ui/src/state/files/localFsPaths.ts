import type { LocalFsEntry } from "../../host";

/**
 * Pure path + listing helpers for the « Dossiers » tab. Separator-agnostic: main returns
 * REAL OS paths, so a Windows listing is backslash-separated while macOS/Linux is not,
 * and the renderer is the one place that has to render both. Nothing here decides access —
 * every path goes back to main, which re-resolves it against the grant.
 */

/** Which separator a path uses. A Windows path (`C:\…`, `\\share\…`) uses `\`. */
export function sepOf(p: string): string {
  return /^[a-zA-Z]:\\|^\\\\/.test(p) ? "\\" : "/";
}

const splitAll = (p: string): string[] => p.split(/[/\\]/);

/** Last segment (a trailing separator is ignored, so `/a/b/` gives `b`). */
export function baseName(p: string): string {
  const parts = splitAll(p).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : p;
}

/** Uppercase extension chip (PDF / XLS / DOC…), capped to 4 chars; `FILE` when a name
 *  carries none. Here rather than with the Bibliothèque's own helpers because two tiers
 *  now label a file by its extension — the library cards and the rail's folder tree —
 *  and a container may not read a page's module for data. */
export function extLabel(name: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name);
  return (m ? m[1] : "file").toUpperCase().slice(0, 4);
}

/** The directory holding `path` (`""` when it has none). Watching a file means watching
 *  its FOLDER — a rename-over replaces the inode a file-watch was holding. */
export function dirOf(path: string): string {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut > 0 ? path.slice(0, cut) : "";
}

/** True when `child` is `root` or strictly beneath it — segment-aware, so `/a/bc` is NOT
 *  under `/a/b`. Mirrors main's `isWithin`; here it only picks a breadcrumb, never grants. */
export function isWithin(root: string, child: string): boolean {
  if (child === root) return true;
  const sep = sepOf(root);
  return child.startsWith(root.endsWith(sep) ? root : root + sep);
}

/** The granted root that contains `path`, or null when none does (a stale cwd after the
 *  user changed their grants — the caller falls back to the roots list). */
export function rootOf(path: string, roots: readonly string[]): string | null {
  // Longest match wins: nested grants (`~/Docs` and `~/Docs/Projets`) must label the
  // breadcrumb with the closest one, or the trail shows segments twice.
  let best: string | null = null;
  for (const r of roots) if (isWithin(r, path) && (!best || r.length > best.length)) best = r;
  return best;
}

/** Folders first, then files, each A→Z (accent- and case-insensitive, French collation). */
export function sortEntries(entries: readonly LocalFsEntry[]): LocalFsEntry[] {
  const rank = (e: LocalFsEntry): number => (e.kind === "dir" ? 0 : 1);
  return [...entries].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "fr", { sensitivity: "base" }),
  );
}

/** Hidden entries (dotfiles) are noise in a folder someone granted to work in — kept out
 *  unless the user asks for them, never silently dropped from a SEARCH (where an explicit
 *  query means they went looking). */
export const isHidden = (e: LocalFsEntry): boolean => e.name.startsWith(".");

export function visibleEntries(
  entries: readonly LocalFsEntry[],
  opts: { query?: string; showHidden?: boolean } = {},
): LocalFsEntry[] {
  const needle = (opts.query ?? "").trim().toLowerCase();
  return sortEntries(
    entries.filter(
      (e) =>
        (opts.showHidden || !isHidden(e)) &&
        (!needle || e.name.toLowerCase().includes(needle)),
    ),
  );
}

/** Roots rendered as the top-level listing, so the first screen is a folder list like any
 *  other. `size`/`mtime` are unknown here (main lists entries, not roots) and read as 0 —
 *  the row simply shows no metadata rather than inventing some. */
export function rootEntries(roots: readonly string[]): LocalFsEntry[] {
  return roots.map((path) => ({ name: baseName(path), path, kind: "dir" as const, size: 0, mtime: 0 }));
}

