import { AnimatePresence } from "framer-motion";
import { AttachmentPendingPreview, AttachmentPreviewModal } from "../../containers/modals";
import { useT } from "../../i18n";
import { isPreviewPending, progressLabel } from "./attachmentPending";
import type { Attachment } from "./Composer";

/**
 * Mounts the before-send document preview for the composer — the wiring Composer's own
 * doc lists as debt to shed (`Composer` is over the LOC cap; new weight lands beside
 * it). Pure pass-through: every decision stays with the caller's callbacks.
 *
 * `key={preview.cid}`: two consecutive previews during the exit animation must never
 * share state (view, bytes) — without a key, AnimatePresence reuses the implicit child
 * (audit 2026-08-10).
 *
 * Opened while the file is still being read or first masked, it shows the pending frame
 * (loader + progress); `preview` is looked up live by cid, so the real preview replaces
 * it under the same key the moment the redaction lands.
 */
export function AttachmentPreviewHost({
  preview,
  currentRedactSig,
  inactiveCategories,
  convCategories,
  onRetryAttachment,
  onRevealChange,
  onForceRedactDoc,
  onDeleteRedactionDoc,
  onAddToVault,
  onClose,
}: {
  preview: Attachment | null;
  currentRedactSig?: string;
  inactiveCategories?: string[];
  convCategories?: Record<string, boolean>;
  onRetryAttachment?: (cid: string) => void;
  onRevealChange?: (cid: string, reveal: string[]) => void;
  onForceRedactDoc?: (cid: string, value: string, token: string) => void;
  onDeleteRedactionDoc?: (cid: string, value: string) => void;
  onAddToVault?: (value: string, token: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <AnimatePresence>
      {preview && isPreviewPending(preview) ? (
        <AttachmentPendingPreview
          key={preview.cid}
          name={preview.name}
          progress={progressLabel(preview, t) ?? t.viewers.loadingFile}
          onClose={onClose}
        />
      ) : preview ? (
        <AttachmentPreviewModal
          key={preview.cid}
          file={preview}
          redacting={preview.redacting}
          redactError={preview.redactError}
          redactProgress={preview.redactProgress}
          stale={
            !!preview.redactEngineSig &&
            !!currentRedactSig &&
            preview.redactEngineSig !== currentRedactSig
          }
          onRerun={onRetryAttachment ? () => onRetryAttachment(preview.cid) : undefined}
          reveal={preview.reveal}
          onRevealChange={onRevealChange ? (r) => onRevealChange(preview.cid, r) : undefined}
          onForceRedact={
            onForceRedactDoc ? (value, token) => onForceRedactDoc(preview.cid, value, token) : undefined
          }
          onDeleteRedaction={
            onDeleteRedactionDoc ? (value) => onDeleteRedactionDoc(preview.cid, value) : undefined
          }
          onAddToVault={onAddToVault}
          inactiveCategories={inactiveCategories}
          convCategories={convCategories}
          onClose={onClose}
        />
      ) : null}
    </AnimatePresence>
  );
}
