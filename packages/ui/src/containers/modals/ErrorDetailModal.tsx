import { useState } from "react";
import { ModalShell } from "./ModalShell";
import { RefreshIcon, CopyIcon, CheckIcon } from "../../components/brand";

/**
 * Full detail of a send/tool error, opened from the compact error banner so the
 * raw (often long) provider/tool message never pollutes the conversation. Offers
 * copy + retry.
 */
export function ErrorDetailModal({
  detail,
  onRetry,
  onClose,
}: {
  detail: string;
  onRetry?: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(detail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <ModalShell onClose={onClose} width="600px" maxHeight="82vh">
      <div className="rrm-head">
        <div className="cv-eyebrow rrm-eyebrow">ERREUR</div>
        <h2 className="cv-display rrm-title">Détail de l'erreur</h2>
        <p className="rrm-sub">
          Le message brut du fournisseur / de l'outil. Il n'est pas ajouté à la
          conversation.
        </p>
      </div>

      <div className="dbg-body-scroll">
        <pre className="dbg-pre err">{detail}</pre>
      </div>

      <div className="confirm-footer">
        <button className="btn-ghost btn-inline" onClick={copy}>
          {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          {copied ? "Copié" : "Copier"}
        </button>
        {onRetry && (
          <button
            className="btn-primary btn-inline"
            onClick={() => {
              onClose();
              onRetry();
            }}
          >
            <RefreshIcon size={14} /> Réessayer
          </button>
        )}
      </div>
    </ModalShell>
  );
}
