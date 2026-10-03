import { useEffect } from "react";
import { useHost, type ExtractedFile } from "../../../host";
import { grantedFolderTarget, useGrantFolder } from "../../../hooks/useGrantFolder";
import { isDeferredFile, type DeferredFile } from "../../../state/files/deferredFile";
import { DRAFT_CONV } from "../../../state/debug/debug";
import { makeStaging } from "../attachmentStaging";
import type { Attachment } from "../Composer";
import { stageDeferredFile } from "../deferredAttach";
import { extractPicked } from "../extractPicked";
import { ocrAllAttachment } from "../ocrAll";
import { logOcrDebug } from "../ocrDebug";
import { redactAttachment } from "../redactAttachment";
import { startReadingPreview } from "../readingPreview";
import { writeStaged } from "../stagedStore";
import { redactMatchCount } from "./redactMatchCount";
import type { AttachmentsApi } from "./useAttachments";
import type { RedactPolicy } from "./useRedactPolicy";
import type { AskTarget } from "../../../types";
import type { ChatViewProps } from "./types";

const newCid = () => Math.random().toString(36).slice(2);

/**
 * Every route a file takes INTO the composer — the native picker, drag-and-drop, the
 * shell's hand-off (library re-attach, « Demander ») and « Lire tout » — all landing in the
 * same staging so no route drifts from the others. Redaction runs on drop, never lazily.
 */
export function useAttachmentIntake(
  p: ChatViewProps,
  att: AttachmentsApi,
  redactPolicy: RedactPolicy,
  stageTarget: (target: AskTarget) => void,
) {
  const { conversation, pendingAttachment, onPendingConsumed } = p;
  const { setAttachments, patchFor, setAttachWarning, redactDeps, convIdRef } = att;
  const host = useHost();
  const countMatches = (text: string | undefined) => redactMatchCount(text, redactPolicy.disabledKinds);
  // The journal target of a drop job: the id NAMED by « Demander » (its conversation isn't
  // on screen), else the open conversation, else the DRAFT — never undefined (`ocrDebug.ts`).
  const logConv = (forConvId?: string) => forConvId ?? conversation?.id ?? DRAFT_CONV;

  const { stage: stageAttachments, patch: patchStaged } = makeStaging({
    currentConvId: () => convIdRef.current,
    setLocal: setAttachments,
    getParked: (id) => redactDeps.store.get(id),
    setParked: (id, files) => writeStaged(redactDeps.store, id, files),
  });
  /** Masking deps for a file staged under `key` — its run writes THERE, wherever the user goes. */
  const depsFor = (key: string, logConvId?: string) => ({
    ...redactDeps,
    stagedKey: key,
    ...(logConvId ? { convId: logConvId } : {}),
  });

  /** The provisional preview of a file being read, written where its chip is staged. */
  const readingFor = (key: string, logConvId?: string) => (cid: string) =>
    startReadingPreview({ ...depsFor(key, logConvId), cid });

  /** `forConvId` overrides the target: the shell's hand-off names a conversation not on screen yet. */
  function addExtractedFiles(picked: ExtractedFile[], forConvId?: string) {
    const added: Attachment[] = picked.map((f) => ({
      ...f,
      cid: newCid(),
      redactPreview: countMatches(f.text),
      redacting: !!f.text.trim(),
    }));
    stageAttachments(added, forConvId);
    const failed = picked.filter((f) => f.error);
    if (failed.length) setAttachWarning(failed.map((f) => `${f.name}: ${f.error}`).join(" · "));
    for (const f of picked) logOcrDebug(f, logConv(forConvId));
    const deps = depsFor(forConvId ?? convIdRef.current, forConvId);
    for (const a of added) redactAttachment(a, deps);
  }

  // Chip first, content after — shared by the shell's hand-off and drag-and-drop. `key`
  // is where the chip is staged: the read and the run land there even after a switch.
  const deferredDeps = (key: string, convId?: string) => ({
    stage: stageAttachments,
    patch: patchStaged,
    countMatches: (t: string) => countMatches(t),
    t: redactDeps.t,
    reading: readingFor(key, convId),
    onExtracted: (f: ExtractedFile, a: Attachment) => {
      logOcrDebug(f, logConv(convId));
      if (f.text.trim()) redactAttachment(a, depsFor(key, convId));
    },
  });
  function addDroppedFiles(files: DeferredFile[]) {
    const key = convIdRef.current;
    for (const d of files) void stageDeferredFile(d, key, deferredDeps(key));
  }

  const canOcrAll = !!host.files?.extractAll;
  function handleOcrAll(cid: string) {
    const a = att.attachments.find((x) => x.cid === cid);
    if (!a || !host.files?.extractAll) return;
    const key = convIdRef.current;
    void ocrAllAttachment(
      {
        // The re-read IS the full extraction (every page): `extract`, never a capped path.
        files: { extractAll: host.files.extract.bind(host.files) },
        patch: (c, patch) => patchStaged(c, patch, key),
        countMatches: (t) => countMatches(t),
        t: redactDeps.t,
        onExtracted: (f, merged) => {
          logOcrDebug(f, logConv(conversation?.id));
          if (f.text.trim()) redactAttachment(merged, depsFor(key));
        },
      },
      a,
    );
  }

  const grantFolder = useGrantFolder();
  // The grant itself changes nothing on screen, so its outcome must: the folder becomes the
  // message's target chip (as « Demander » does from the rail), a refusal the warning banner.
  // A folder ALREADY granted still stages — the user picked it to ask about it.
  async function addFolder() {
    const out = await grantFolder.addFolder();
    if (out?.error) setAttachWarning(out.error);
    const target = grantedFolderTarget(out);
    if (target) stageTarget(target);
  }

  async function attach() {
    if (!host.files) return;
    try {
      // Placeholder chips INSTANTLY, extraction async, so a slow OCR doesn't delay the file's appearance.
      if (host.files.pickPaths) {
        const picked = await host.files.pickPaths();
        if (!picked.length) return;
        const key = convIdRef.current;
        const placeholders: Attachment[] = picked.map((f) => ({
          name: f.name,
          path: f.path,
          kind: "",
          text: "",
          chars: 0,
          cid: newCid(),
          redactPreview: 0,
          extracting: true,
        }));
        setAttachments((prev) => [...prev, ...placeholders]);
        extractPicked(placeholders, {
          extract: host.files.extract.bind(host.files),
          update: patchFor(key),
          countMatches,
          onRead: (f, merged) => {
            logOcrDebug(f, logConv());
            if (f.error) setAttachWarning(`${f.name}: ${f.error}`);
            else if (f.text.trim()) redactAttachment(merged, depsFor(key));
          },
          warn: setAttachWarning,
          t: redactDeps.t,
          reading: readingFor(key),
        });
        return;
      }
      addExtractedFiles(await host.files.pick()); // browser preview: no pickPaths
    } catch (e) {
      setAttachWarning(e instanceof Error ? e.message : String(e));
    }
  }

  // The shell's hand-off, staged for the conversation it NAMED: « Demander » creates the
  // conversation and hands the file over in the same breath, and the new conversation
  // reaches this screen a commit later — the restore effect picks it up whichever order.
  useEffect(() => {
    if (!pendingAttachment) return;
    const { file, convId } = pendingAttachment;
    if (isDeferredFile(file)) void stageDeferredFile(file, convId, deferredDeps(convId ?? convIdRef.current, convId));
    else addExtractedFiles([file], convId);
    onPendingConsumed?.();
  }, [pendingAttachment]);

  return {
    canAttach: !!host.files,
    attach,
    addDroppedFiles,
    canOcrAll,
    handleOcrAll,
    onAddFolder: grantFolder.canAdd ? () => void addFolder() : undefined,
  };
}

export type AttachmentIntakeApi = ReturnType<typeof useAttachmentIntake>;
