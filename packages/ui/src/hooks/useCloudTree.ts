import { useCallback, useEffect, useMemo, useState } from "react";
import { useHost, type CloudSource, type LocalFsEntry } from "../host";
import { useLazyTree } from "./useLazyTree";

/**
 * Les stockages connectés (Drive, OneDrive) parcourus comme les dossiers locaux.
 *
 * L'astuce tient en une ligne : un identifiant de fournisseur n'est pas un chemin, alors
 * on fabrique une CLÉ `"<source>|<id>"` et l'arbre partagé n'a rien à savoir de plus.
 * `folderTreeRows` s'en sert pour l'ouverture, la profondeur et la garde anti-boucle
 * exactement comme d'un chemin de disque.
 *
 * Absence de slot (aperçu web, mobile) ou aucun compte connecté ⇒ aucune racine, donc rien
 * ne se dessine : le groupe reste la liste d'états que le panneau montrait déjà.
 */

/** La clé d'une entrée distante. `folderId` vide = la racine du compte. */
export const cloudKey = (sourceId: string, folderId = ""): string => `${sourceId}|${folderId}`;

/** Défaire une clé — `folderId` vaut `null` à la racine, ce qu'attend l'hôte. */
export function parseCloudKey(key: string): { sourceId: string; folderId: string | null } {
  const cut = key.indexOf("|");
  const sourceId = cut < 0 ? key : key.slice(0, cut);
  const folderId = cut < 0 ? "" : key.slice(cut + 1);
  return { sourceId, folderId: folderId || null };
}

export function useCloudTree(active: boolean) {
  const host = useHost();
  const cloud = host.cloudFs;
  const [sources, setSources] = useState<CloudSource[]>([]);
  const [tick, setTick] = useState(0);

  // Connecter ou déconnecter un compte change la liste : même signal que pour les
  // dossiers locaux, donc un Drive branché apparaît sans rouvrir le panneau.
  useEffect(() => {
    // `return` EXPLICITE : c'est l'unsubscribe. En arrow concise, le retour implicite
    // devient le cleanup de React par accident — et le jour où l'API change de type de
    // retour, ça finit sur l'ErrorBoundary (`scripts/check-effect-returns.mjs`).
    return host.mcp?.onChanged?.(() => setTick((n) => n + 1));
  }, [host.mcp]);

  useEffect(() => {
    if (!active || !cloud) return;
    let alive = true;
    void cloud
      .sources()
      .then((r) => alive && setSources(r.sources))
      .catch(() => alive && setSources([]));
    return () => {
      alive = false;
    };
  }, [active, cloud, tick]);

  const roots = useMemo(() => sources.map((s) => cloudKey(s.id)), [sources]);

  const list = useCallback(
    async (key: string): Promise<LocalFsEntry[]> => {
      if (!cloud) return [];
      const { sourceId, folderId } = parseCloudKey(key);
      const { entries } = await cloud.list(sourceId, folderId);
      // La forme de ligne est celle de l'arbre : `path` porte la clé, `size` est inconnue
      // et vaut 0 — la ligne n'affiche alors aucune métadonnée plutôt que d'en inventer.
      return entries.map((e) => ({
        name: e.name,
        path: cloudKey(sourceId, e.id),
        kind: e.kind,
        size: 0,
        mtime: e.mtime,
      }));
    },
    [cloud],
  );

  const tree = useLazyTree({ active, roots, list });

  const refresh = useCallback(() => {
    setTick((n) => n + 1);
    tree.refresh();
  }, [tree]);

  return { sources, rows: tree.rows, toggle: tree.toggle, error: tree.error, refresh };
}
