import { ipcRenderer } from "electron";

/**
 * The Bibliothèque's folder browser over the Filesystem connector's granted roots.
 * Main answers an ENVELOPE (`{ok, data} | {ok, error}`) rather than throwing, because
 * `ipcRenderer.invoke` would otherwise reach the UI as "Error invoking remote method …"
 * and the browser shows the real reason to the user — a refused path, a read-only disk.
 * Unwrapping here means every method below either resolves with data or throws a clean
 * `Error` carrying main's own French message.
 */
type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(channel: string, payload?: unknown): Promise<T> {
  const r = (await ipcRenderer.invoke(channel, payload)) as Envelope<T>;
  if (!r?.ok) throw new Error(r?.error || "opération impossible");
  return r.data;
}

export interface LocalFsEntry {
  name: string;
  path: string;
  kind: "dir" | "file" | "link";
  size: number;
  mtime: number;
}

export const localFs = {
  roots: (): Promise<{ available: boolean; roots: string[] }> => call("localfs:roots"),
  list: (path: string): Promise<{ path: string; entries: LocalFsEntry[]; truncated: boolean }> =>
    call("localfs:list", { path }),
  stat: (path: string): Promise<LocalFsEntry> => call("localfs:stat", { path }),
  /** Raw bytes, base64 — one op serves a preview of text, an image and a PDF alike. */
  read: (path: string): Promise<{ base64: string; size: number }> => call("localfs:read", { path }),
  search: (
    path: string,
    query: string,
  ): Promise<{ entries: LocalFsEntry[]; truncated: boolean }> =>
    call("localfs:search", { path, query }),
  mkdir: (path: string): Promise<{ path: string }> => call("localfs:mkdir", { path }),
  rename: (source: string, destination: string): Promise<{ path: string }> =>
    call("localfs:rename", { source, destination }),
  /** Text AND OCR geometry in ONE round trip, extracted in main from the granted path.
   *  NEVER returns a `path`: the renderer must not be able to pass it back to `files:read`. */
  extract: (path: string): Promise<Record<string, unknown>> => call("localfs:extract", { path }),
  /** OS Corbeille, never `unlink` — a delete the user clicks stays recoverable. */
  trash: (path: string): Promise<null> => call("localfs:trash", { path }),
  open: (path: string): Promise<null> => call("localfs:open", { path }),
  /** Replace the watched set (empty list stops). Returns what is actually watched. */
  watch: (paths: string[]): Promise<{ watching: string[] }> => call("localfs:watch", { paths }),
  onChanged: (cb: (path: string) => void): (() => void) => {
    const h = (_e: unknown, path: string): void => cb(path);
    ipcRenderer.on("localfs:changed", h);
    return () => ipcRenderer.removeListener("localfs:changed", h);
  },
};
