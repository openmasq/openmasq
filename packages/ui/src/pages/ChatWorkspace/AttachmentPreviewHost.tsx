import { AnimatePresence } from "framer-motion";
import { useMemo, useRef } from "react";
import { AttachmentPendingPreview, AttachmentPreviewModal } from "../../containers/modals";
import { partialMaskedChunks } from "../../containers/modals/viewers/doc/partialPreview";
import { readingPages } from "../../containers/modals/viewers/reading/pageTiles";
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
 * it under the same key the moment the redaction lands. Meanwhile the part already
 * masked shows, masked (`maskedSoFar` → `partialMaskedChunks`) — the rest never does — and a
 * PDF being read shows its pages blurred, the pages read masked (`reading`, PREVIEW ONLY).
 * The real preview that takes over is `continued`: no opening animation, so the swap does
 * not read as the dialog closing and reopening (`AttachmentPreviewHost.test.tsx`).
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
  // The file whose PENDING frame is (or was just) on screen: its real preview continues it.
  const pendingCid = useRef<string | null>(null);
  const pending = !!preview && isPreviewPending(preview);
  if (pending) pendingCid.current = preview.cid;
  else if (!preview) pendingCid.current = null;
  const continued = !!preview && !pending && pendingCid.current === preview.cid;
  const text = preview?.text;
  const soFar = preview?.maskedSoFar;
  const p = preview?.redactProgress;
  const reading = preview?.reading;
  const real = useMemo(
    () =>
      text && soFar && p && p.total > 0
        ? { chunks: partialMaskedChunks(text, soFar), rest: t.viewers.partialRest(Math.round((p.done / p.total) * 100)) }
        : undefined,
    [text, soFar, p, t],
  );
  // While the file is READ, the pages it has read show masked as they come (`readingPreview.ts`,
  // already cut for display) — and stay until the real masking has something of its own.
  const masked = reading?.masked;
  const partial =
    real ??
    (masked && reading.total > 0
      ? { chunks: masked.chunks, rest: t.viewers.reading.maskedPages(masked.pages, reading.total) }
      : undefined);
  const pages = useMemo(
    () =>
      reading && reading.total > 0 && preview?.extracting
        ? readingPages(reading, !(preview.extractQueued && preview.extractQueued > 0))
        : undefined,
    [reading, preview?.extracting, preview?.extractQueued],
  );
  return (
    <AnimatePresence>
      {preview && pending ? (
        <AttachmentPendingPreview
          key={preview.cid}
          name={preview.name}
          progress={progressLabel(preview, t) ?? t.viewers.loadingFile}
          pages={pages}
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
          continued={continued}
        />
      ) : null}
    </AnimatePresence>
  );
}
