import { ModalShell } from "./ModalShell";
import { ModalTitle } from "./ModalTitle";
import { RefreshIcon } from "../../components/brand";
import { ReleaseNoteBody } from "../../components/releaseNotes";
import { releaseDate, type ReleaseNote } from "../../state/settings/releaseNotes";
import { useT } from "../../i18n";
import { BRAND } from "@openmasq/branding";

/**
 * « Une nouvelle version est prête » — what the system used to announce in English in a
 * bare dialog box, the app now says itself, with what the version brings.
 *
 * The note's body is rendered by the SAME component as the help and the Réglages
 * (`components/releaseNotes`): a note reads identically everywhere, by construction.
 *
 * ⚠️ It opens without being blocking. « Plus tard » cancels nothing — the update stays
 * downloaded, and the right rail's button reopens it — because the moment an update
 * finishes downloading has no reason to be the moment one wants to stop everything.
 */
export function UpdateReadyModal({
  version,
  note,
  onClose,
  onInstall,
}: {
  version: string;
  /** The published note, when it exists. Absent ⇒ we announce anyway: the gesture
   *  matters more than the text, and staying silent because a CMS is quiet would be the failure. */
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
            // No published note for this version: say so, rather than opening on
            // a blank that reads as the app being broken.
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
