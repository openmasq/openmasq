import { useEffect, useState } from "react";
import { ModalShell } from "./ModalShell";
import { ModalTitle } from "./ModalTitle";
import { RefreshIcon } from "../../components/brand";
import { ReleaseNoteBody } from "../../components/releaseNotes";
import { releaseDate, type ReleaseNote } from "../../state/settings/releaseNotes";
import { useT } from "../../i18n";
import { BRAND } from "@openmasq/branding";

/** After this long with the app still on screen, the restart is said to be slow — and the
 *  way out (quit by hand, the update applies at the next launch) is offered. */
export const RESTART_SLOW_MS = 20_000;

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
 *
 * ⚠️ **« Redémarrer maintenant » is acknowledged at once.** Main first tears down the
 * Electron instances the app spawned for itself (the agent browser, the MCP server —
 * bounded at ten seconds, `updates/install.ts`) and only then hands the bundle to
 * ShipIt, which quits, swaps and relaunches: several seconds during which the window is
 * still there and, before this, nothing moved. The button now says it is restarting,
 * refuses a second click, and after {@link RESTART_SLOW_MS} tells the person how to get
 * out of it themselves — the update applies at the next launch whatever happens.
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
  const [restarting, setRestarting] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!restarting) return;
    const id = setTimeout(() => setSlow(true), RESTART_SLOW_MS);
    return () => clearTimeout(id);
  }, [restarting]);
  const install = () => {
    if (restarting && !slow) return; // one hand-off at a time; « Réessayer » is allowed once it is slow
    setRestarting(true);
    setSlow(false);
    onInstall();
  };
  const copy = t.modals.updateReady;
  return (
    <ModalShell onClose={onClose} width="min(560px, 94vw)" maxHeight="82vh">
      <div className="om-upd">
        <div className="om-upd-head">
          <span className="om-upd-ic">
            <RefreshIcon size={18} />
          </span>
          <div>
            <div className="cv-eyebrow">{copy.eyebrow}</div>
            <ModalTitle>{note?.title || `${BRAND.name} ${version}`}</ModalTitle>
            <p className="om-upd-sub">
              {copy.version(version)}
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
            <p className="om-upd-empty">{copy.noNote}</p>
          )}
        </div>

        {restarting && (
          <p className={`om-upd-status${slow ? " slow" : ""}`} role="status" aria-live="polite">
            {slow ? copy.restartSlow : copy.restartingHint}
          </p>
        )}

        <div className="om-upd-foot">
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            disabled={restarting && !slow}
          >
            {copy.later}
          </button>
          <button
            type="button"
            className={`btn-primary${restarting ? " is-busy" : ""}`}
            onClick={install}
            disabled={restarting && !slow}
            aria-busy={restarting && !slow}
          >
            {restarting ? (slow ? copy.retry : copy.restarting) : copy.restartNow}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
