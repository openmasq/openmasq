import { useRef } from "react";
import { XIcon } from "../../../components/brand";
import { useT } from "../../../i18n";
import { ModalShell } from "../ModalShell";
import { FileSkeleton } from "./FileSkeleton";
import { DocText } from "./doc/DocText";
import type { DocChunk } from "./doc/docSearch";

/**
 * The preview opened while its file is still being read (OCR) or masked: the same
 * frame as `AttachmentPreviewModal`, the live progress, and — once masking has done a
 * part — that part MASKED (`doc/partialPreview.ts`), marked provisional, followed by a
 * placeholder where the rest will be. The rest's text is never drawn. The caller swaps in
 * the real preview the moment the masking lands.
 */
export function AttachmentPendingPreview({
  name,
  progress,
  partial,
  onClose,
}: {
  name: string;
  progress: string;
  /** The part already masked and the percentage done; absent ⇒ a skeleton only. */
  partial?: { chunks: DocChunk[]; pct: number };
  onClose: () => void;
}) {
  const t = useT();
  const activeRef = useRef<HTMLElement | null>(null);
  const shown = !!partial && partial.chunks.length > 0;
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
        <div className={`fv-status${shown ? " is-partial" : ""}`}>{shown ? t.viewers.partialNote : t.viewers.pendingNote}</div>
        {shown && <DocText chunks={partial.chunks} query="" active={-1} activeRef={activeRef} />}
        {shown && <div className="fv-partial-rest">{t.viewers.partialRest(partial.pct)}</div>}
        <FileSkeleton variant="doc" />
      </div>
    </ModalShell>
  );
}
