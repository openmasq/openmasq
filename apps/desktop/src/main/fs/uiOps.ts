// The USER-facing surface of the filesystem worker: the ops behind the Bibliothèque's
// folder browser. Structured JSON in, structured JSON out — the caller is a React list,
// not a model reading prose, so nothing here returns a string to be re-parsed.
//
// Same process, same `grant.resolve` gate as `toolOps.ts`, DIFFERENT map: a model-supplied
// name can't land here (see `protocol.ts`). Two ops exist only on this surface —
// raw-byte `read` (an aperçu of an image/PDF needs bytes, `read_file` is utf8-only) and,
// in `mainOps.ts`, `trash`. Neither is an MCP tool, and neither should become one.
import { readFile, mkdir, rename, stat, lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Grant } from "./grant";
import type { FsBytes, FsEntry, FsListing } from "./protocol";
import { setWatch } from "./watch";

/** An aperçu is rendered in the renderer, so the bytes cross IPC — a hard cap keeps a
 *  stray click on a disk image from pushing gigabytes through it. Bigger files are
 *  offered « Ouvrir dans l'application système » instead. */
const MAX_READ = 16_000_000;
const MAX_ENTRIES = 2_000; // one directory listing
const MAX_SEARCH = 500;
const MAX_DEPTH = 12;

/** Directories the USER search never descends into — machine-managed trees whose
 *  hundred-thousand files ate the 500-hit budget before the user's own documents
 *  were reached. UI surface only: the model's `search_files` keeps full fidelity. */
const SEARCH_SKIP_DIRS = new Set(["node_modules", ".git", ".hg", ".svn", ".cache", "__pycache__"]);

const str = (a: Record<string, unknown>, k: string): string => {
  const v = a[k];
  if (typeof v !== "string" || !v) throw new Error(`argument \`${k}\` requis (chaîne)`);
  return v;
};

/** Metadata for one entry. A symlink is described by its OWN stat (`lstat`), never by
 *  its target: the target may sit outside the grant, and listing must not be a way to
 *  learn anything about it. Opening one still goes through `grant.resolve`, which
 *  resolves the real path and rejects an escape. */
async function entryOf(dir: string, name: string, isLink: boolean, isDir: boolean): Promise<FsEntry> {
  const path = join(dir, name);
  try {
    const st = isLink ? await lstat(path) : await stat(path);
    return {
      name,
      path,
      kind: isLink ? "link" : isDir ? "dir" : "file",
      size: st.size,
      mtime: st.mtimeMs,
    };
  } catch {
    // A file that vanished between readdir and stat (or is unreadable) still belongs in
    // the listing — showing it with unknown metadata beats dropping it silently.
    return { name, path, kind: isLink ? "link" : isDir ? "dir" : "file", size: 0, mtime: 0 };
  }
}

/** `watch` is the one op that pushes back, so every op takes the notifier and ignores it. */
export type UiOp = (
  g: Grant,
  a: Record<string, unknown>,
  notify: (p: string) => void,
) => Promise<unknown>;

export const UI_OPS: Record<string, UiOp> = {
  /** The granted roots — the browser's top level, and the only valid starting points. */
  async roots(g) {
    return [...g.roots];
  },

  async list(g, a): Promise<FsListing> {
    const path = g.resolve(str(a, "path"));
    const raw = await readdir(path, { withFileTypes: true });
    const truncated = raw.length > MAX_ENTRIES;
    const entries = await Promise.all(
      raw
        .slice(0, MAX_ENTRIES)
        .map((e) => entryOf(path, e.name, e.isSymbolicLink(), e.isDirectory())),
    );
    return { path, entries, truncated };
  },

  async stat(g, a): Promise<FsEntry> {
    const path = g.resolve(str(a, "path"));
    const st = await stat(path);
    return {
      name: path.slice(path.lastIndexOf("/") + 1),
      path,
      kind: st.isDirectory() ? "dir" : "file",
      size: st.size,
      mtime: st.mtimeMs,
    };
  },

  async read(g, a): Promise<FsBytes> {
    const p = g.resolve(str(a, "path"));
    const st = await stat(p);
    if (!st.isFile()) throw new Error("ce chemin n'est pas un fichier");
    if (st.size > MAX_READ) {
      throw new Error("fichier trop volumineux pour l'aperçu — ouvrez-le dans votre application");
    }
    const buf = await readFile(p);
    return { base64: buf.toString("base64"), size: st.size };
  },

  // NOTE: there is deliberately NO `write` op on the UI surface — in-app file editing
  // via the sidebar was removed, so the browser cannot become a way around the write
  // gate. The model's `write_file` (TOOL surface) is the one write path that remains.

  async mkdir(g, a): Promise<{ path: string }> {
    const p = g.resolve(str(a, "path"));
    await mkdir(p, { recursive: true });
    return { path: p };
  },

  /** Rename/move. BOTH ends are resolved, so a destination outside the grant is refused
   *  — moving a file out of the authorized folders is not a rename, it is an escape. */
  async rename(g, a): Promise<{ path: string }> {
    const source = g.resolve(str(a, "source"));
    const destination = g.resolve(str(a, "destination"));
    await rename(source, destination);
    return { path: destination };
  },

  async search(g, a): Promise<{ entries: FsEntry[]; truncated: boolean }> {
    const root = g.resolve(str(a, "path"));
    const needle = str(a, "query").toLowerCase();
    const out: FsEntry[] = [];
    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > MAX_DEPTH || out.length >= MAX_SEARCH) return;
      let raw;
      try {
        raw = await readdir(dir, { withFileTypes: true });
      } catch {
        return; // unreadable dir — skip
      }
      for (const e of raw) {
        if (out.length >= MAX_SEARCH) return;
        if (e.isSymbolicLink()) continue; // never follow links during traversal
        if (e.name.toLowerCase().includes(needle)) {
          out.push(await entryOf(dir, e.name, false, e.isDirectory()));
        }
        // Dependency/VCS internals eat the whole result budget on a code folder (a
        // `node_modules` alone can be 100k files) and the user is searching THEIR
        // files. Skip DESCENDING into them; a matching name at this level still shows.
        if (e.isDirectory() && !SEARCH_SKIP_DIRS.has(e.name)) await walk(join(dir, e.name), depth + 1);
      }
    };
    await walk(root, 0);
    return { entries: out, truncated: out.length >= MAX_SEARCH };
  },

  /** Replace the watched set. An EMPTY list stops everything — the call is the whole
   *  truth, so a caller that stops caring simply stops listing. Every path is resolved
   *  through the gate first: watching is a read, and reads stay inside the grant. */
  async watch(g, a, notify): Promise<{ watching: string[] }> {
    const raw = Array.isArray(a.paths) ? (a.paths as unknown[]) : [];
    const resolved: string[] = [];
    for (const p of raw) {
      if (typeof p !== "string" || !p) continue;
      // A path that no longer resolves (folder deleted, grant revoked) is skipped rather
      // than failing the whole call — the other directories must keep refreshing.
      try {
        resolved.push(g.resolve(p));
      } catch {
        /* not ours to watch */
      }
    }
    return { watching: setWatch(resolved, notify) };
  },
};
