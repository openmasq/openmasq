import { useState } from "react";
import { ModalShell } from "./ModalShell";
import { RefreshIcon, CopyIcon, CheckIcon } from "../../components/brand";
import { useT } from "../../i18n";

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
  const t = useT();
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
        <div className="cv-eyebrow rrm-eyebrow">{t.modals.error.eyebrow}</div>
        <h2 className="cv-display rrm-title">{t.modals.error.title}</h2>
        <p className="rrm-sub">{t.modals.error.sub}</p>
      </div>

      <div className="dbg-body-scroll">
        <pre className="dbg-pre err">{detail}</pre>
      </div>

      <div className="confirm-footer">
        <button className="btn-ghost btn-inline" onClick={copy}>
          {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          {copied ? t.modals.error.copied : t.modals.error.copy}
        </button>
        {onRetry && (
          <button
            className="btn-primary btn-inline"
            onClick={() => {
              onClose();
              onRetry();
            }}
          >
            <RefreshIcon size={14} /> {t.modals.error.retry}
          </button>
        )}
      </div>
    </ModalShell>
  );
}
