import { useCallback } from "react";
import { useHost } from "../../../host";
import type { DeferredFile } from "../../../state/deferredFile";
import { FileViewerModal } from "../../../containers/modals";
import type { LoadedFile } from "../../../containers/modals/viewers/FileViewerBody";
import { base64ToBytes } from "../../../state/bytes";
import { loadLocalFile, mimeOf } from "./localFile";
import { baseName, sepOf } from "../../../state/localFsPaths";
import { useLiveFile } from "./useLiveFile";

/**
 * A local file opened from the « Dossiers » finder, rendered in **the** file viewer —
 * the same container every other preview in the app uses, here in its `panel` form so it
 * splits the screen beside the conversation instead of covering it.
 *
 * Only the byte SOURCE differs: a stored file comes from the encrypted DB, this one is
 * read from disk through the connector's grant on every open, so what you see is what is
 * on disk right now. There is no « Redacted » tab, and that is honest rather than a
 * missing feature: nothing has been masked, because this file has not been sent anywhere.
 * « Demander » is the moment it would be — and it goes through the normal send pipeline.
 */
export function LocalFilePanel({
  path,
  name,
  onClose,
  onAttach,
}: {
  path: string;
  name: string;
  onClose: () => void;
  /** Stage the file into a fresh conversation. Absent ⇒ no « Demander ». */
  onAttach?: (file: DeferredFile) => void;
}) {
  const host = useHost();
  const fs = host.localFs;
  const mime = mimeOf(name);

  // `rev` bumps when the file changes on disk — including when the MODEL writes to it.
  // Threading it through the loader's identity is what makes the aperçu re-read on its
  // own: the viewer re-runs its load effect whenever this callback changes.
  const rev = useLiveFile(path);
  const loadFile = useCallback(async (): Promise<LoadedFile | null> => {
    if (!fs) return null;
    const { base64 } = await fs.read(path);
    return { name, mime, original: base64ToBytes(base64), scrubbed: null };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `rev` is the refresh trigger
  }, [fs, path, name, mime, rev]);

  const folder = path.slice(0, path.lastIndexOf(sepOf(path)));

  return (
    <FileViewerModal
      panel
      id={`localfile:${path}`}
      name={name}
      mime={mime}
      onClose={onClose}
      loadFile={loadFile}
      // Le fichier RÉEL, immédiatement : rien n'a été masqué puisque rien n'a été envoyé
      // (la promesse de l'en-tête ci-dessus + `folders/CLAUDE.md`). Sans ceci, un PDF
      // local payait une passe NER COMPLÈTE avant le premier pixel.
      redacted={false}
      onOpenExternal={fs ? () => void fs.open(path).catch(() => {}) : undefined}
      // Where it really lives — the user is looking at their own folder, not a copy.
      storageLabel={folder ? `dans ${baseName(folder)}` : "sur votre disque"}
      // READ-ONLY on purpose — no « Modifier » tab, for ANY format. In-app file
      // editing via the sidebar was removed with the CSV/Univer editors: the aperçu
      // shows the disk truth, « Ouvrir dans l'application » is where editing lives.
      // ⚠️ On met en scène une PROMESSE, pas un fichier : la conversation s'ouvre et le chip
      // paraît sur-le-champ, la lecture et l'OCR le remplissent après. Attendre ici rendait
      // le geste muet pendant des secondes — c'est le comportement qu'a déjà le sélecteur
      // natif, pas une faveur faite à ce chemin.
      onAsk={
        onAttach
          ? () =>
              onAttach({
                name,
                mime,
                load: () => loadLocalFile(host, { name, path, kind: "file", size: 0, mtime: 0 }),
              })
          : undefined
      }
    />
  );
}
