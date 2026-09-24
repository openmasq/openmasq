import { useCallback, useEffect, useRef, useState } from "react";
import { useRedaction } from "../../../send/redaction";
import { DRAFT_CONV } from "../../../state/debug/debug";
import type { Attachment } from "../Composer";
import { redactAttachment, type RedactAttachmentDeps } from "../redactAttachment";
import type { ChatViewProps } from "./types";

/**
 * The files staged on the composer. They are the CONVERSATION's, not the screen's: this
 * hook keeps a local mirror for rendering and writes every change through to the store,
 * which is what makes them survive a trip to Bibliothèque (the screen unmounts) and stops
 * them following the user into the NEXT conversation (the screen does NOT remount).
 */
export function useAttachments(p: ChatViewProps) {
  const { conversation, settings, orgProfile, getStagedFiles, onStagedFilesChange } = p;
  const redactAsync = useRedaction();
  const [attachments, setAttachmentsState] = useState<Attachment[]>(
    () => [...(getStagedFiles?.(conversation?.id ?? "") ?? [])],
  );
  // The mirror's latest value, so the updater form resolves OUTSIDE `setState`: a prop
  // called from inside a state updater fires twice under StrictMode.
  const attachmentsRef = useRef<Attachment[]>(attachments);
  const convIdRef = useRef(conversation?.id ?? "");
  convIdRef.current = conversation?.id ?? "";
  const setAttachments = useCallback(
    (next: Attachment[] | ((prev: Attachment[]) => Attachment[])) => {
      const value = typeof next === "function" ? next(attachmentsRef.current) : next;
      attachmentsRef.current = value;
      setAttachmentsState(value);
      onStagedFilesChange?.(convIdRef.current, value);
    },
    [onStagedFilesChange],
  );
  const updateAttachment = (cid: string, patch: Partial<Attachment>) =>
    setAttachments((prev) => prev.map((a) => (a.cid === cid ? { ...a, ...patch } : a)));
  const [attachWarning, setAttachWarning] = useState<string | null>(null);
  // Per-attachment controllers, so a LONG document redaction can be CANCELLED by removing the chip.
  const attachRedactCtrls = useRef<Map<string, AbortController>>(new Map());

  // Fresh per render so it always sees the current settings/engine. `convId` is never
  // undefined: with no conversation yet, the DRAFT, which the first send adopts (`ocrDebug.ts`).
  const redactDeps: RedactAttachmentDeps = {
    settings,
    orgForcedCategories: orgProfile?.forcedCategories,
    redactAsync,
    ctrls: attachRedactCtrls.current,
    updateAttachment,
    convId: conversation?.id ?? DRAFT_CONV,
    convCategories: conversation?.redactCategories,
    convVault: conversation?.redactionVault,
  };

  // Restore the conversation's staged files when opening it (bypasses the write-through:
  // this is a READ of what the store holds). Resume a redaction that never finished on this
  // screen — otherwise the chip stays « en cours » for ever and the send refuses it. An
  // EXTRACTION left mid-flight cannot resume (the bytes only exist at drop time): declare
  // it failed rather than pulse for ever while being silently excluded from the send.
  useEffect(() => {
    const staged = [...(getStagedFiles?.(conversation?.id ?? "") ?? [])];
    attachmentsRef.current = staged;
    setAttachmentsState(staged);
    for (const a of staged) {
      if (a.redacting && !a.replacements?.length && !a.redactError) redactAttachment(a, redactDeps);
      if (a.extracting && !a.text?.trim() && !a.error) {
        updateAttachment(a.cid, { extracting: false, error: "extraction interrompue — redéposez le fichier" });
      }
    }
  }, [conversation?.id]);

  const removeAttachment = (i: number) => {
    const a = attachments[i];
    if (a) {
      attachRedactCtrls.current.get(a.cid)?.abort();
      attachRedactCtrls.current.delete(a.cid);
    }
    setAttachments((prev) => prev.filter((_, j) => j !== i));
  };
  const retryAttachment = (cid: string) => {
    const a = attachments.find((x) => x.cid === cid);
    if (a) redactAttachment(a, redactDeps);
  };
  const setReveal = (cid: string, reveal: string[]) =>
    setAttachments((prev) => prev.map((a) => (a.cid === cid ? { ...a, reveal } : a)));

  return {
    attachments,
    setAttachments,
    updateAttachment,
    convIdRef,
    attachWarning,
    setAttachWarning,
    redactDeps,
    removeAttachment,
    retryAttachment,
    setReveal,
  };
}

export type AttachmentsApi = ReturnType<typeof useAttachments>;
