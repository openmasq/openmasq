import { ModalShell } from "../../containers/modals/ModalShell";
import { useT } from "../../i18n";

/**
 * Asked before sending a message that has document attachments: send the
 * redacted document as extracted TEXT, or as the redacted FILE (page images, so
 * layout/tables are preserved). The file option needs a VISION model — when the
 * current one is text-only it's disabled with a one-click switch to a compatible
 * model (`onSwitchAndFile`). Escape / scrim / Annuler dismiss without sending.
 */
export function SendModeDialog({
  fileCount,
  modelLabel,
  modelVision,
  suggestedVisionLabel,
  textTokens,
  fileSizeLabel,
  fileTooBig,
  onText,
  onFile,
  onSwitchAndFile,
  onCancel,
}: {
  fileCount: number;
  modelLabel: string;
  modelVision: boolean;
  /** Label of the vision model we'd switch to (null ⇒ none available). */
  suggestedVisionLabel: string | null;
  /** Rough token count of the extracted-TEXT option (already formatted, e.g. "12 k"). */
  textTokens: string;
  /** Payload size of the FILE (images) option — "…" while probing, formatted size when
   *  ready, or null when unavailable. */
  fileSizeLabel: string | null;
  /** The file payload exceeds the metered-gateway cap → warn (sending it would 400). */
  fileTooBig: boolean;
  onText: () => void;
  onFile: () => void;
  onSwitchAndFile: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <ModalShell onClose={onCancel} width="480px">
      <div className="confirm-body">
        <h2 className="cv-display confirm-title">{t.cards.sendMode.title}</h2>
        <p className="confirm-text">{t.cards.sendMode.question(fileCount)}</p>
      </div>

      <div className="sendmode-options">
        <button className="sendmode-opt" onClick={onText}>
          <span className="sendmode-opt-head">
            <span className="sendmode-opt-title">{t.cards.sendMode.textOption}</span>
            <span className="sendmode-opt-size">{t.cards.sendMode.textTokens(textTokens)}</span>
          </span>
          <span className="sendmode-opt-desc">{t.cards.sendMode.textDesc}</span>
        </button>

        {modelVision ? (
          <button className="sendmode-opt sendmode-opt--accent" onClick={onFile}>
            <span className="sendmode-opt-head">
              <span className="sendmode-opt-title">{t.cards.sendMode.fileOption}</span>
              {fileSizeLabel && (
                <span className={`sendmode-opt-size ${fileTooBig ? "over" : ""}`}>
                  {fileSizeLabel === "…" ? t.cards.sendMode.computing : t.cards.sendMode.approx(fileSizeLabel)}
                </span>
              )}
            </span>
            <span className="sendmode-opt-desc">
              {t.cards.sendMode.fileDesc}
              {fileTooBig && <b className="sendmode-opt-warn">{t.cards.sendMode.tooBig}</b>}
            </span>
          </button>
        ) : (
          <div className="sendmode-opt sendmode-opt--disabled">
            <span className="sendmode-opt-title">{t.cards.sendMode.fileOption}</span>
            <span className="sendmode-opt-desc">{t.cards.sendMode.noFiles(modelLabel)}</span>
            {suggestedVisionLabel && (
              <button className="sendmode-switch" onClick={onSwitchAndFile}>
                {t.cards.sendMode.switchAndSend(suggestedVisionLabel)}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="confirm-footer">
        <button className="btn-ghost" onClick={onCancel}>
          {t.cards.sendMode.cancel}
        </button>
      </div>
    </ModalShell>
  );
}
