import { ModalShell } from "../../containers/modals/ModalShell";

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
  return (
    <ModalShell onClose={onCancel} width="480px">
      <div className="confirm-body">
        <h2 className="cv-display confirm-title">Envoyer le document</h2>
        <p className="confirm-text">
          Comment envoyer {fileCount === 1 ? "ce document" : `ces ${fileCount} documents`} au
          modèle&nbsp;? Dans les deux cas, seule la version redacted part.
        </p>
      </div>

      <div className="sendmode-options">
        <button className="sendmode-opt" onClick={onText}>
          <span className="sendmode-opt-head">
            <span className="sendmode-opt-title">Texte extrait</span>
            <span className="sendmode-opt-size">≈ {textTokens} tokens de texte</span>
          </span>
          <span className="sendmode-opt-desc">
            Le texte du document, redacted — rapide et léger, sans la mise en page.
          </span>
        </button>

        {modelVision ? (
          <button className="sendmode-opt sendmode-opt--accent" onClick={onFile}>
            <span className="sendmode-opt-head">
              <span className="sendmode-opt-title">Document redacted (fichier)</span>
              {fileSizeLabel && (
                <span className={`sendmode-opt-size ${fileTooBig ? "over" : ""}`}>
                  {fileSizeLabel === "…" ? "calcul…" : `≈ ${fileSizeLabel}`}
                </span>
              )}
            </span>
            <span className="sendmode-opt-desc">
              Les pages redactées en images — garde la mise en page, les tableaux, la structure.
              {fileTooBig && (
                <b className="sendmode-opt-warn"> — trop volumineux pour ce modèle, préférez le texte.</b>
              )}
            </span>
          </button>
        ) : (
          <div className="sendmode-opt sendmode-opt--disabled">
            <span className="sendmode-opt-title">Document redacted (fichier)</span>
            <span className="sendmode-opt-desc">
              ⚠ {modelLabel} ne gère pas l'envoi de fichiers.
            </span>
            {suggestedVisionLabel && (
              <button className="sendmode-switch" onClick={onSwitchAndFile}>
                Basculer sur {suggestedVisionLabel} et envoyer le fichier
              </button>
            )}
          </div>
        )}
      </div>

      <div className="confirm-footer">
        <button className="btn-ghost" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </ModalShell>
  );
}
