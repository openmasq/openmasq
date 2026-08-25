import { useCallback, useEffect, useRef, useState } from "react";
import { useHost } from "../../../host";
import { noteForVersion, useReleaseNotesFeed, type ReleaseNote } from "../../../state/releaseNotes";

/**
 * UNE MISE À JOUR EST TÉLÉCHARGÉE, ET PRÊTE À S'INSTALLER.
 *
 * ⚠️ C'est le RENDERER qui l'annonce, plus le système. Une boîte de dialogue de l'OS
 * disait « x.y.z is ready to install » en anglais, ne disait pas ce que la version
 * apporte, et volait le focus au milieu d'une phrase. Ici on a la note publiée
 * (Contentful) et on sait attendre : la fenêtre se referme, un bouton du rail droit la
 * rouvre tant que la version reste en attente.
 *
 * Trois choix qui tiennent :
 *  · **Une seule ouverture automatique par version.** `announcedRef` retient les versions
 *    déjà annoncées, donc un second évènement `downloaded` pour la même build — ils se
 *    répètent, l'updater re-signale à chaque vérification — ne rouvre rien par-dessus ce
 *    qu'on est en train d'écrire. Refermer n'efface pas la mise à jour : le bouton reste.
 *  · **La note n'est pas attendue.** Si Contentful ne répond pas, ou si la version n'a pas
 *    de note publiée, la fenêtre s'ouvre quand même avec le numéro et le geste — ce qui
 *    compte est « une nouvelle version est prête, redémarrez », et taire ça parce qu'un
 *    CMS est muet serait la seule vraie panne.
 *  · **`install()` est le seul geste que main est seul à pouvoir faire** ; tout le reste
 *    (quoi montrer, quand, à qui) est décidé ici.
 */
export interface UpdateReadyApi {
  /** La version téléchargée qui attend un redémarrage, sinon `null`. */
  version: string | null;
  /** Sa note publiée, si elle existe. */
  note?: ReleaseNote;
  /** Poids du téléchargement, quand l'updater l'a donné. */
  sizeBytes?: number;
  /** La fenêtre est-elle ouverte ? */
  open: boolean;
  setOpen: (v: boolean) => void;
  /** Redémarrer et installer. */
  install: () => void;
}

export function useUpdateReady(): UpdateReadyApi {
  const host = useHost();
  const updates = host.updates;
  const [ready, setReady] = useState<{ version: string; sizeBytes?: number } | null>(null);
  const [open, setOpen] = useState(false);
  const announcedRef = useRef<Set<string>>(new Set());
  // Les notes sont demandées ICI aussi : on peut très bien n'avoir ouvert ni les Réglages
  // ni l'aide de la session, et c'est précisément ce moment-là qui doit être servi.
  const { notes } = useReleaseNotesFeed();

  useEffect(() => {
    if (!updates) return;
    return updates.onStatus((s) => {
      if (s.state !== "downloaded" || !s.version) return;
      setReady({ version: s.version, sizeBytes: s.sizeBytes });
      if (announcedRef.current.has(s.version)) return;
      announcedRef.current.add(s.version);
      setOpen(true);
    });
  }, [updates]);

  const install = useCallback(() => {
    void updates?.install().catch(() => {});
  }, [updates]);

  return {
    version: ready?.version ?? null,
    note: noteForVersion(notes, ready?.version),
    sizeBytes: ready?.sizeBytes,
    open: open && !!ready,
    setOpen,
    install,
  };
}
