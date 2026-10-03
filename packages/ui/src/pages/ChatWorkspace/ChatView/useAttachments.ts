import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../../../i18n";
import { useRedaction } from "../../../send/redaction";
import { DRAFT_CONV } from "../../../state/debug/debug";
import { maskQueue } from "../../../state/files/maskQueue";
import { dropReadingMask } from "../readingMask";
import { subscribeStaged } from "../../../state/files/stagedActivity";
import { createStagedFiles } from "../../../state/files/stagedFiles";
import type { Attachment } from "../Composer";
import { redactAttachment, type RedactAttachmentDeps } from "../redactAttachment";
import { patchStaged, writeStaged, type StagedStore } from "../stagedStore";
import type { ChatViewProps } from "./types";

/**
 * The files staged on the composer. They are the CONVERSATION's, not the screen's: the
 * STORE holds them (keyed by conversation) and this hook keeps a mirror for rendering,
 * which is what makes them survive a trip to Bibliothèque (the screen unmounts) and stops
 * them following the user into the NEXT conversation (the screen does NOT remount).
 *
 * Work that outlives a visit — a read, a masking run — writes to the conversation it was
 * started for (`patchFor`, `stagedStore.ts`); the mirror re-reads on the store's signal,
 * so coming back shows the run where it is, never restarted.
 */
export function useAttachments(p: ChatViewProps) {
  const { conversation, settings, orgProfile, getStagedFiles, onStagedFilesChange } = p;
  const redactAsync = useRedaction();
  // Without the store's hooks (a test, a preview), a local staging plays its part.
  const fallback = useRef<StagedStore | null>(null);
  const storeRef = useRef<StagedStore>(null!);
  storeRef.current =
    getStagedFiles && onStagedFilesChange
      ? { get: getStagedFiles, set: onStagedFilesChange }
      : (fallback.current ??= createStagedFiles() as unknown as StagedStore);
  const store: StagedStore = { get: (k) => storeRef.current.get(k), set: (k, v) => storeRef.current.set(k, v) };
  const convIdRef = useRef(conversation?.id ?? "");
  convIdRef.current = conversation?.id ?? "";
  const [attachments, setAttachmentsState] = useState<Attachment[]>(() => [...store.get(convIdRef.current)]);
  // The mirror's latest value (the updater form resolves OUTSIDE `setState`: a prop
  // called from inside a state updater fires twice under StrictMode).
  const attachmentsRef = useRef<Attachment[]>(attachments);
  const reread = useCallback(() => {
    const staged = [...storeRef.current.get(convIdRef.current)];
    attachmentsRef.current = staged;
    setAttachmentsState(staged);
  }, []);
  const setAttachments = useCallback((next: Attachment[] | ((prev: Attachment[]) => Attachment[])) => {
    const key = convIdRef.current;
    const value = typeof next === "function" ? next([...storeRef.current.get(key)]) : next;
    writeStaged(storeRef.current, key, value);
    attachmentsRef.current = value;
    setAttachmentsState(value);
  }, []);
  /** Patch a chip of THE CONVERSATION `key` — bound at the start of a read or a run. */
  const patchFor =
    (key: string) =>
    (cid: string, patch: Partial<Attachment>): void =>
      void patchStaged(storeRef.current, key, cid, patch);
  const updateAttachment = (cid: string, patch: Partial<Attachment>) => patchFor(convIdRef.current)(cid, patch);
  const [attachWarning, setAttachWarning] = useState<string | null>(null);
  const t = useT();

  // Fresh per render so it always sees the current settings/engine. `convId` is never
  // undefined: with no conversation yet, the DRAFT, which the first send adopts (`ocrDebug.ts`).
  const redactDeps: RedactAttachmentDeps = {
    t,
    settings,
    orgForcedCategories: orgProfile?.forcedCategories,
    redactAsync,
    store,
    stagedKey: conversation?.id ?? "",
    convId: conversation?.id ?? DRAFT_CONV,
    convCategories: conversation?.redactCategories,
    convVault: conversation?.redactionVault,
  };

  // A write elsewhere (a run finishing, a read landing) to the conversation on screen.
  useEffect(() => {
    return subscribeStaged((key) => {
      if (key === convIdRef.current) reread();
    });
  }, [reread]);

  // Restore the conversation's staged files when opening it (a READ of what the store
  // holds). A run already queued or running is LEFT ALONE — re-queuing it is what restarted
  // the masking at every visit. Only a chip marked masking with no run behind it is queued.
  useEffect(() => {
    reread();
    for (const a of attachmentsRef.current) {
      if (a.redacting && !a.replacements?.length && !a.redactError && !maskQueue.has(a.cid)) {
        redactAttachment(a, redactDeps);
      }
    }
  }, [conversation?.id]);

  const removeAttachment = (i: number) => {
    const a = attachments[i];
    if (a) {
      maskQueue.cancel(a.cid);
      // The masking its read started, if any: stopped, and never handed to a later run.
      maskQueue.cancel(`reading:${a.cid}`);
      dropReadingMask(a.cid);
    }
    setAttachments((prev) => prev.filter((x) => x.cid !== a?.cid));
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
    patchFor,
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
