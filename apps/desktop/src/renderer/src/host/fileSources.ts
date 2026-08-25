import type { Host } from "@openmasq/ui";

/**
 * Les deux SOURCES DE FICHIERS de l'hôte : les dossiers accordés sur cette machine et les
 * stockages connectés. Sorties de `main.tsx` (règle 1 : il ne pouvait plus grossir), et
 * ensemble parce qu'elles répondent à la même question côté UI — le panneau « Dossiers »
 * les affiche l'une sous l'autre.
 *
 * ⚠️ Chacune est gardée sur SON namespace : le preload ne se recharge pas à chaud, donc un
 * preload antérieur à l'une d'elles doit la laisser ABSENTE — l'UI dégrade alors (le groupe
 * n'est pas navigable) au lieu d'appeler des méthodes qui n'existent pas.
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
