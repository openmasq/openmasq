import { ModalShell } from "./ModalShell";
import { ModalTitle } from "./ModalTitle";
import { RefreshIcon } from "../../components/brand";
import { ReleaseNoteBody } from "../../components/releaseNotes";
import { releaseDate, type ReleaseNote } from "../../state/releaseNotes";
import { useT } from "../../i18n";
import { BRAND } from "@openmasq/branding";

/**
 * « Une nouvelle version est prête » — ce que le système annonçait en anglais dans une
 * boîte de dialogue nue, l'app le dit désormais elle-même, avec ce que la version apporte.
 *
 * Le corps de la note est rendu par le MÊME composant que l'aide et les Réglages
 * (`components/releaseNotes`) : une note se lit à l'identique partout, par construction.
 *
 * ⚠️ Elle s'ouvre sans être bloquante. « Plus tard » n'annule rien — la mise à jour reste
 * téléchargée, et le bouton du rail droit la rouvre — parce que l'instant où une mise à
 * jour finit de se télécharger n'a aucune raison d'être celui où on veut tout arrêter.
 */
export function UpdateReadyModal({
  version,
  note,
  onClose,
  onInstall,
}: {
  version: string;
  /** La note publiée, quand elle existe. Absente ⇒ on annonce quand même : le geste
   *  compte plus que le texte, et se taire parce qu'un CMS est muet serait la panne. */
  note?: ReleaseNote;
  onClose: () => void;
  onInstall: () => void;
}) {
  const t = useT();
  return (
    <ModalShell onClose={onClose} width="min(560px, 94vw)" maxHeight="82vh">
      <div className="om-upd">
        <div className="om-upd-head">
          <span className="om-upd-ic">
            <RefreshIcon size={18} />
          </span>
          <div>
            <div className="cv-eyebrow">{t.modals.updateReady.eyebrow}</div>
            <ModalTitle>{note?.title || `${BRAND.name} ${version}`}</ModalTitle>
            <p className="om-upd-sub">
              {t.modals.updateReady.version(version)}
              {note?.releaseDate ? ` · ${releaseDate(note.releaseDate, t)}` : ""}
            </p>
          </div>
        </div>

        <div className="om-upd-body">
          {note ? (
            <ReleaseNoteBody note={note} />
          ) : (
            // Pas de note publiée pour cette version : le dire, plutôt que d'ouvrir sur
            // un blanc qui se lit comme une panne de l'app.
            <p className="om-upd-empty">{t.modals.updateReady.noNote}</p>
          )}
        </div>

        <div className="om-upd-foot">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t.modals.updateReady.later}
          </button>
          <button type="button" className="btn-primary" onClick={onInstall}>
            {t.modals.updateReady.restartNow}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
