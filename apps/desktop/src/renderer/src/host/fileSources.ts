import type { Host } from "@openmasq/ui";

/**
 * The host's two FILE SOURCES: folders granted on this machine and connected
 * storages. Moved out of `main.tsx` (rule 1: it could no longer grow), and
 * grouped together because they answer the same question on the UI side — the "Folders"
 * panel shows them one below the other.
 *
 * ⚠️ Each is guarded on ITS OWN namespace: the preload doesn't hot-reload, so a
 * preload predating one of them must leave it ABSENT — the UI then degrades (the group
 * isn't navigable) instead of calling methods that don't exist.
 */
export function fileSourceSlots(): Pick<Host, "localFs" | "cloudFs"> {
  const bridge = window.openmasq;
  return {
    localFs: bridge.localFs
      ? {
          roots: () => bridge.localFs!.roots(),
          list: (path) => bridge.localFs!.list(path),
          stat: (path) => bridge.localFs!.stat(path),
          read: (path) => bridge.localFs!.read(path),
          search: (path, query) => bridge.localFs!.search(path, query),
          extract: (path) => bridge.localFs!.extract(path),
          mkdir: (path) => bridge.localFs!.mkdir(path),
          rename: (source, destination) => bridge.localFs!.rename(source, destination),
          trash: (path) => bridge.localFs!.trash(path),
          open: (path) => bridge.localFs!.open(path),
          watch: (paths) => bridge.localFs!.watch(paths),
          onChanged: (cb) => bridge.localFs!.onChanged(cb),
        }
      : undefined,
    cloudFs: bridge.cloudFs
      ? {
          sources: () => bridge.cloudFs!.sources(),
          list: (sourceId, folderId) => bridge.cloudFs!.list(sourceId, folderId),
        }
      : undefined,
  };
}
