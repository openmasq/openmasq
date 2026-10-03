import { AnimatePresence } from "framer-motion";
import { useMemo, useRef } from "react";
import { AttachmentPendingPreview, AttachmentPreviewModal } from "../../containers/modals";
import { partialMaskedChunks } from "../../containers/modals/viewers/doc/partialPreview";
import { pendingPdf } from "../../containers/modals/viewers/pdf/pendingPages";
import { previewShape } from "../../containers/modals/viewers/previewViews";
import { useT } from "../../i18n";
import { isPreviewPending, progressLabel } from "./attachmentPending";
import type { Attachment } from "./Composer";

/** A PDF still being read or masked that the REAL viewer can draw: its bytes are in hand
 *  and the extraction has accepted it (it streams its pages, or its read is over) — the
 *  renderer never parses a file the extraction's gate may still refuse. */
function livePdf(a: Attachment): boolean {
  const s = previewShape(a);
  return s.isPdf && s.hasBytes && (!!a.reading || !a.extracting) && !a.error && !a.blocked;
}

/**
 * Mounts the before-send document preview for the composer — the wiring Composer's own
 * doc lists as debt to shed (`Composer` is over the LOC cap; new weight lands beside
 * it). Pure pass-through: every decision stays with the caller's callbacks.
 *
 * `key={preview.cid}`: two consecutive previews during the exit animation must never
 * share state (view, bytes) — without a key, AnimatePresence reuses the implicit child
 * (audit 2026-08-10).
 *
 * Opened while the file is still being read or first masked: a PDF the viewer can draw
 * opens the REAL preview at once, in its pending state (`pendingPdf`: each page shown once
 * masked, its blurred thumbnail until then) — it becomes final in place when the masking
 * lands, same instance. Any other file shows the pending frame (loader + progress + the part
 * already masked, `maskedSoFar` → `partialMaskedChunks`), and the real preview that takes
 * over is `continued`: no opening animation (`AttachmentPreviewHost.test.tsx`).
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
  const pending = !!preview && isPreviewPending(preview);
  const live = pending && livePdf(preview);
  // The file whose TEXT pending frame is (or was just) on screen: its real preview continues it.
  const pendingCid = useRef<string | null>(null);
  if (pending && !live) pendingCid.current = preview.cid;
  else if (!preview) pendingCid.current = null;
  const continued = !!preview && !(pending && !live) && pendingCid.current === preview.cid;
  const text = preview?.text;
  const soFar = preview?.maskedSoFar;
  const p = preview?.redactProgress;
  const partial = useMemo(
    () =>
      text && soFar && p && p.total > 0
        ? { chunks: partialMaskedChunks(text, soFar), rest: t.viewers.partialRest(Math.round((p.done / p.total) * 100)) }
        : undefined,
    [text, soFar, p, t],
  );
  const reading = preview?.reading;
  const extracting = preview?.extracting;
  const queued = preview?.extractQueued;
  const pdf = useMemo(
    () => (live ? pendingPdf({ text, extracting, extractQueued: queued, maskedSoFar: soFar, reading }) : undefined),
    [live, text, extracting, queued, soFar, reading],
  );
  const progress = preview && pending ? (progressLabel(preview, t) ?? t.viewers.loadingFile) : "";
  // While the masking runs, the preview is display-only: no map yet to reveal or force in.
  const editable = !pending;
  return (
    <AnimatePresence>
      {preview && pending && !pdf ? (
        <AttachmentPendingPreview
          key={preview.cid}
          name={preview.name}
          progress={progress}
          partial={partial}
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
          onRerun={onRetryAttachment && editable ? () => onRetryAttachment(preview.cid) : undefined}
          reveal={preview.reveal}
          onRevealChange={onRevealChange && editable ? (r) => onRevealChange(preview.cid, r) : undefined}
          onForceRedact={
            onForceRedactDoc && editable ? (value, token) => onForceRedactDoc(preview.cid, value, token) : undefined
          }
          onDeleteRedaction={
            onDeleteRedactionDoc && editable ? (value) => onDeleteRedactionDoc(preview.cid, value) : undefined
          }
          onAddToVault={editable ? onAddToVault : undefined}
          pending={pdf ? { progress, pdf } : undefined}
          inactiveCategories={inactiveCategories}
          convCategories={convCategories}
          onClose={onClose}
          continued={continued}
        />
      ) : null}
    </AnimatePresence>
  );
}
