import { AnimatePresence } from "framer-motion";
import { AttachmentPreviewModal } from "../../containers/modals";
import type { Attachment } from "./Composer";

/**
 * Mounts the before-send document preview for the composer — the wiring Composer's own
 * doc lists as debt to shed (`Composer` is over the LOC cap; new weight lands beside
 * it). Pure pass-through: every decision stays with the caller's callbacks.
 *
 * `key={preview.cid}` : deux aperçus consécutifs pendant l'animation de sortie ne
 * doivent jamais partager l'état (vue, octets) — sans clé, AnimatePresence réutilise
 * l'enfant implicite (audit 2026-08-10).
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
  onAddToCoffre,
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
  onAddToCoffre?: (value: string, token: string) => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {preview && (
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
          onAddToCoffre={onAddToCoffre}
          inactiveCategories={inactiveCategories}
          convCategories={convCategories}
          onClose={onClose}
        />
      )}
    </AnimatePresence>
  );
}
