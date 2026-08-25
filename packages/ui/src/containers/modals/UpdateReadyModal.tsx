import { ModalShell } from "./ModalShell";
import { ModalTitle } from "./ModalTitle";
import { RefreshIcon } from "../../components/brand";
import { ReleaseNoteBody } from "../../components/releaseNotes";
import { frenchDate, type ReleaseNote } from "../../state/releaseNotes";
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
  return (
    <ModalShell onClose={onClose} width="min(560px, 94vw)" maxHeight="82vh">
      <div className="om-upd">
        <div className="om-upd-head">
          <span className="om-upd-ic">
            <RefreshIcon size={18} />
          </span>
          <div>
            <div className="cv-eyebrow">MISE À JOUR PRÊTE</div>
            <ModalTitle>{note?.title || `${BRAND.name} ${version}`}</ModalTitle>
            <p className="om-upd-sub">
              Version {version}
              {note?.releaseDate ? ` · ${frenchDate(note.releaseDate)}` : ""}
            </p>
          </div>
        </div>

        <div className="om-upd-body">
          {note ? (
            <ReleaseNoteBody note={note} />
          ) : (
            // Pas de note publiée pour cette version : le dire, plutôt que d'ouvrir sur
            // un blanc qui se lit comme une panne de l'app.
            <p className="om-upd-empty">
              Les nouveautés de cette version ne sont pas encore publiées.
            </p>
          )}
        </div>

        <div className="om-upd-foot">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Plus tard
          </button>
          <button type="button" className="btn-primary" onClick={onInstall}>
            Redémarrer maintenant
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
