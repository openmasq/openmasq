import { useRef } from "react";
import { XIcon } from "../../../components/brand";
import { useT } from "../../../i18n";
import { ModalShell } from "../ModalShell";
import { FileSkeleton } from "./FileSkeleton";
import { DocText } from "./doc/DocText";
import type { DocChunk } from "./doc/docSearch";
import { ReadingPages } from "./reading/ReadingPages";
import type { ReadingPageView } from "./reading/pageTiles";

/**
 * The preview opened while its file is still being read (OCR) or masked: the same
 * frame as `AttachmentPreviewModal`, the live progress, the pages of a PDF being read as
 * BLURRED thumbnails with their state (`reading/`), and — once masking has done a part —
 * that part MASKED (`doc/partialPreview.ts`), marked provisional, followed by a placeholder
 * where the rest will be. The rest's text is never drawn. The caller swaps in the real
 * preview the moment the masking lands.
 */
export function AttachmentPendingPreview({
  name,
  progress,
  pages,
  partial,
  onClose,
}: {
  name: string;
  progress: string;
  /** A PDF being read: its pages (unreadable thumbnails + state). Absent ⇒ none drawn. */
  pages?: { pages: ReadingPageView[]; more: number };
  /** The part already masked and the line saying how far it goes; absent ⇒ a skeleton only. */
  partial?: { chunks: DocChunk[]; rest: string };
  onClose: () => void;
}) {
  const t = useT();
  const activeRef = useRef<HTMLElement | null>(null);
  const shown = !!partial && partial.chunks.length > 0;
  const note = shown ? t.viewers.partialNote : pages ? t.viewers.reading.note : t.viewers.pendingNote;
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
        {pages && <ReadingPages pages={pages.pages} more={pages.more} />}
        <div className={`fv-status${shown ? " is-partial" : ""}`}>{note}</div>
        {shown && <DocText chunks={partial.chunks} query="" active={-1} activeRef={activeRef} />}
        {shown && <div className="fv-partial-rest">{partial.rest}</div>}
        <FileSkeleton variant="doc" />
      </div>
    </ModalShell>
  );
}
