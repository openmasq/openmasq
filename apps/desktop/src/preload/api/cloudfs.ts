import { ipcRenderer } from "electron";

/**
 * Browse a connected storage (Drive, OneDrive, Dropbox) — the counterpart of `localfs` for
 * files that aren't on this machine. Same envelope contract: main answers
 * `{ok, data} | {ok, error}` and we re-throw here, so the panel shows the real reason
 * for a failure rather than "Error invoking remote method …".
 *
 * Read-only, and of the only shape an interface needs: listing. Reading the
 * CONTENTS of a file remains the model's and its tools' business.
 */
type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(channel: string, payload?: unknown): Promise<T> {
  const r = (await ipcRenderer.invoke(channel, payload)) as Envelope<T>;
  if (!r?.ok) throw new Error(r?.error || "opération impossible");
  return r.data;
}

export interface CloudEntry {
  /** The provider's identifier (fileId Drive, itemId Graph, Dropbox path) — opaque. */
  id: string;
  name: string;
  kind: "dir" | "file";
  mtime: number;
}

export interface CloudSource {
  id: string;
  connectorId: string;
  label?: string;
}

export const cloudFs = {
  /** The connected storages the app knows how to browse (empty = none). */
  sources: (): Promise<{ sources: CloudSource[] }> => call("cloudfs:sources"),
  /** The contents of a folder; `folderId` absent = the account root. */
  list: (sourceId: string, folderId: string | null): Promise<{ entries: CloudEntry[] }> =>
    call("cloudfs:list", { sourceId, folderId }),
};
