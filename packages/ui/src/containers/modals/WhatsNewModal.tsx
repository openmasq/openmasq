import { ModalShell } from "./ModalShell";
import { ModalTitle } from "./ModalTitle";
import { RefreshIcon } from "../../components/brand";
import { ReleaseNoteBody } from "../../components/releaseNotes";
import { releaseDate, type ReleaseNote } from "../../state/settings/releaseNotes";
import { useT } from "../../i18n";

/**
 * « Nouvelle version installée » — what the version the app now runs brings, once, at the
 * first launch on it (`shell/hooks/useWhatsNew.ts`). Same family and same note body as the
 * « ready » modal (`UpdateReadyModal`), without its action: there is nothing left to decide.
 */
export function WhatsNewModal({
  version,
  note,
  onClose,
}: {
  version: string;
  note: ReleaseNote;
  onClose: () => void;
}) {
  const t = useT();
  const copy = t.modals.whatsNew;
  return (
    <ModalShell onClose={onClose} width="min(560px, 94vw)" maxHeight="82vh">
      <div className="om-upd">
        <div className="om-upd-head">
          <span className="om-upd-ic">
            <RefreshIcon size={18} />
          </span>
          <div>
            <div className="cv-eyebrow">{copy.eyebrow}</div>
            <ModalTitle>{note.title}</ModalTitle>
            <p className="om-upd-sub">
              {t.modals.updateReady.version(version)}
              {note.releaseDate ? ` · ${releaseDate(note.releaseDate, t)}` : ""}
            </p>
          </div>
        </div>
        <div className="om-upd-body">
          <ReleaseNoteBody note={note} />
        </div>
        <div className="om-upd-foot">
          <button type="button" className="btn-primary" onClick={onClose}>
            {copy.close}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
