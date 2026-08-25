import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LocalFsEntry } from "../host";
import { folderTreeRows, missingListings, toggleFolder } from "../state/folderTree";

/**
 * Un arbre qui ne lit QUE ce qu'on ouvre — la mécanique commune aux dossiers de cette
 * machine et aux stockages connectés.
 *
 * Les deux sources diffèrent par une seule chose (comment on liste un dossier), et par
 * rien d'autre : mêmes racines, même dépliage, même « je lis une fois puis je garde ».
 * En écrire deux copies, c'est reproduire deux fois les pièges ci-dessous — dont celui
 * qui a déjà coûté une boucle infinie.
 *
 * ⚠️ `requestedRef` est ce qui empêche la boucle : la lecture pose `pending`, `pending`
 * nourrit les lignes, les lignes disent ce qui manque — donc un dossier encore en vol
 * serait redemandé au re-rendu que sa propre demande a provoqué. L'effet se déclenche
 * aussi sur une CLÉ (chaîne), parce qu'un nouveau tableau des mêmes chemins est une
 * dépendance différente à chaque rendu.
 */
export function useLazyTree({
  active,
  roots,
  list,
}: {
  active: boolean;
  /** Les racines, déjà résolues par l'appelant (chemins ou clés composées). */
  roots: readonly string[];
  /** Lister un dossier. Doit LEVER sur un échec — un dossier illisible ne doit jamais
   *  se rendre comme un dossier vide. */
  list: (path: string) => Promise<LocalFsEntry[]>;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [listings, setListings] = useState<Record<string, LocalFsEntry[]>>({});
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  // Les dossiers dont la lecture a ÉCHOUÉ. Sans cet ensemble, la ligne restait « … » pour
  // toujours : un échec se lisait comme un chargement lent, donc comme un dossier qui ne
  // rend pas ses enfants — alors qu'un échec a une cause, affichée juste en dessous.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const reqRef = useRef(0);
  const requestedRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  /** Oublier UN dossier (le disque a changé) — il sera relu s'il est encore ouvert. */
  const dropListing = useCallback((path: string) => {
    requestedRef.current.delete(path);
    setFailed((cur) => {
      if (!cur.has(path)) return cur;
      const next = new Set(cur);
      next.delete(path);
      return next;
    });
    setListings((cur) => {
      if (!(path in cur)) return cur;
      const next = { ...cur };
      delete next[path];
      return next;
    });
  }, []);

  useEffect(() => {
    if (tick === 0) return;
    reqRef.current++;
    requestedRef.current.clear();
    setListings({});
    setFailed(new Set());
    setError("");
  }, [tick]);

  const rows = useMemo(
    () => folderTreeRows(roots, listings, expanded, pending, failed),
    [roots, listings, expanded, pending, failed],
  );

  const wanted = useMemo(
    () => missingListings(rows, listings).filter((p) => !requestedRef.current.has(p)),
    [rows, listings],
  );
  // NUL comme séparateur, jamais l'espace : un dossier s'appelle couramment « Mes
  // Documents », et recouper la clé sur les espaces demanderait deux chemins inexistants.
  const wantedKey = wanted.join("\u0000");
  useEffect(() => {
    if (!active || !wantedKey) return;
    const paths = wantedKey.split("\u0000");
    paths.forEach((p) => requestedRef.current.add(p));
    setPending((cur) => new Set([...cur, ...paths]));
    const id = ++reqRef.current;
    void (async () => {
      for (const path of paths) {
        try {
          const entries = await list(path);
          if (id !== reqRef.current) return;
          setListings((cur) => ({ ...cur, [path]: entries }));
        } catch (e) {
          if (id !== reqRef.current) return;
          // Honnête : dossier retiré, disque débranché, autorisation révoquée, compte
          // déconnecté. Le listing reste ABSENT (donc pas « vide »), et le chemin sort
          // des demandés pour qu'un « Réessayer » relise vraiment.
          requestedRef.current.delete(path);
          setFailed((cur) => new Set([...cur, path]));
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          setPending((cur) => {
            const next = new Set(cur);
            next.delete(path);
            return next;
          });
        }
      }
    })();
    // `list` n'est pas dans les dépendances À DESSEIN : l'appelant la recrée à chaque
    // rendu, et la clé dit déjà exactement ce qu'il reste à lire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, wantedKey]);

  /** Replier puis redéplier est le « réessayer » naturel : l'échec s'oublie ici, donc la
   *  lecture repart pour de bon au lieu de re-rendre l'ancien verdict. */
  const toggle = useCallback((path: string) => {
    setError("");
    setFailed((cur) => {
      if (!cur.has(path)) return cur;
      const next = new Set(cur);
      next.delete(path);
      return next;
    });
    setExpanded((cur) => toggleFolder(cur, path));
  }, []);

  return { rows, expanded, toggle, error, refresh, dropListing };
}
