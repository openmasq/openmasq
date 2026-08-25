import { useCallback, useEffect, useState } from "react";
import { useHost } from "../host";
import { watchDir } from "../state/watchDirs";
import { useLazyTree } from "./useLazyTree";

/**
 * Les dossiers ACCORDÉS sur cette machine, en arbre — le panneau « Dossiers » du rail.
 *
 * Tout ce qui est commun avec le stockage connecté (dépliage, lecture paresseuse, le
 * garde-fou anti-boucle) vit dans `useLazyTree`. Il ne reste ici que ce qui n'appartient
 * qu'au local : les racines que le connecteur a accordées, et la SURVEILLANCE du disque —
 * un dossier distant ne prévient pas quand il change, celui-ci si.
 */
export function useFolderTree(active: boolean) {
  const host = useHost();
  const fs = host.localFs;
  const [roots, setRoots] = useState<string[]>([]);
  const [tick, setTick] = useState(0);

  const list = useCallback(
    async (path: string) => {
      if (!fs) return [];
      return (await fs.list(path)).entries;
    },
    [fs],
  );
  const tree = useLazyTree({ active, roots, list });

  // Un dossier accordé ou révoqué dans Réglages reconstruit la connexion : on relit les
  // racines à ce signal, pour qu'un dossier tout juste autorisé apparaisse sans rien rouvrir.
  useEffect(() => {
    return host.mcp?.onChanged?.(() => setTick((n) => n + 1)); // l'unsubscribe, explicite
  }, [host.mcp]);

  useEffect(() => {
    if (!active || !fs) return;
    let alive = true;
    void fs
      .roots()
      .then((r) => alive && setRoots(r.available ? r.roots : []))
      .catch(() => alive && setRoots([]));
    return () => {
      alive = false;
    };
  }, [active, fs, tick]);

  // Surveiller chaque dossier OUVERT — via le registre partagé, parce que le Finder de la
  // Bibliothèque et le panneau du fichier ouvert surveillent les leurs en même temps et
  // que l'appel de plateforme remplace tout l'ensemble (`state/watchDirs.ts`).
  const watchKey = [...tree.expanded].sort().join("\u0000");
  const { dropListing } = tree;
  useEffect(() => {
    if (!active || !fs || !watchKey) return;
    const stops = watchKey.split("\u0000").map((dir) => watchDir(fs, dir, () => dropListing(dir)));
    return () => stops.forEach((stop) => stop());
  }, [active, fs, watchKey, dropListing]);

  const refresh = useCallback(() => {
    setTick((n) => n + 1);
    tree.refresh();
  }, [tree]);

  return { roots, rows: tree.rows, toggle: tree.toggle, error: tree.error, refresh };
}
