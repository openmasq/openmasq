import { XIcon } from "../../../components/brand";
import { useT } from "../../../i18n";
import { ModalShell } from "../ModalShell";
import { FileSkeleton } from "./FileSkeleton";

/**
 * The preview opened while its file is still being read (OCR) or masked: the same
 * frame as `AttachmentPreviewModal`, a document-shaped skeleton and the live progress.
 * The caller swaps in the real preview the moment there is something redacted to show
 * — the document is never displayed unmasked in the meantime.
 */
export function AttachmentPendingPreview({
  name,
  progress,
  onClose,
}: {
  name: string;
  progress: string;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <ModalShell onClose={onClose} width="min(1200px, 94vw)" maxHeight="90vh">
      <div className="fv-corner">
        <button type="button" className="fv-close fv-close-x" onClick={onClose} title={t.viewers.closeTip} aria-label={t.viewers.close}>
          <XIcon size={18} />
        </button>
      </div>
      <div className="rrm-head fv-head">
        <div className="cv-eyebrow rrm-eyebrow">{t.viewers.eyebrow}</div>
        <h2 className="cv-display rrm-title fv-title fv-title-caption">{name}</h2>
        <p className="rrm-sub fv-caption-sub" role="status" aria-live="polite">
          {progress}
        </p>
      </div>
      <div className="fv-body fv-body-stable">
        <div className="fv-status">{t.viewers.pendingNote}</div>
        <FileSkeleton variant="doc" />
      </div>
    </ModalShell>
  );
}
