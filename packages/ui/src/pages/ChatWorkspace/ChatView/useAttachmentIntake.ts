import { useEffect } from "react";
import { useHost, type ExtractedFile } from "../../../host";
import { useGrantFolder } from "../../../hooks/useGrantFolder";
import { isDeferredFile, type DeferredFile } from "../../../state/files/deferredFile";
import { DRAFT_CONV } from "../../../state/debug/debug";
import { makeStaging } from "../attachmentStaging";
import type { Attachment } from "../Composer";
import { stageDeferredFile } from "../deferredAttach";
import { ocrAllAttachment } from "../ocrAll";
import { logOcrDebug } from "../ocrDebug";
import { redactAttachment } from "../redactAttachment";
import { redactMatchCount } from "./redactMatchCount";
import type { AttachmentsApi } from "./useAttachments";
import type { RedactPolicy } from "./useRedactPolicy";
import type { ChatViewProps } from "./types";

const newCid = () => Math.random().toString(36).slice(2);

/**
 * Every route a file takes INTO the composer — the native picker, drag-and-drop, the
 * shell's hand-off (library re-attach, « Demander ») and « Lire tout » — all landing in the
 * same staging so no route drifts from the others. Redaction runs on drop, never lazily.
 */
export function useAttachmentIntake(p: ChatViewProps, att: AttachmentsApi, redactPolicy: RedactPolicy) {
  const { conversation, pendingAttachment, onPendingConsumed, getStagedFiles, onStagedFilesChange } = p;
  const { setAttachments, updateAttachment, setAttachWarning, redactDeps, convIdRef } = att;
  const host = useHost();
  const countMatches = (text: string | undefined) => redactMatchCount(text, redactPolicy.disabledKinds);
  // The journal target of a drop job: the id NAMED by « Demander » (its conversation isn't
  // on screen), else the open conversation, else the DRAFT — never undefined (`ocrDebug.ts`).
  const logConv = (forConvId?: string) => forConvId ?? conversation?.id ?? DRAFT_CONV;

  const { stage: stageAttachments, patch: patchStaged } = makeStaging({
    currentConvId: () => convIdRef.current,
    setLocal: setAttachments,
    getParked: getStagedFiles,
    setParked: onStagedFilesChange,
  });

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
    const deps = forConvId ? { ...redactDeps, convId: forConvId } : redactDeps;
    for (const a of added) redactAttachment(a, deps);
  }

  // Chip first, content after — shared by the shell's hand-off and drag-and-drop.
  const deferredDeps = (convId?: string) => ({
    stage: stageAttachments,
    patch: patchStaged,
    countMatches: (t: string) => countMatches(t),
    onExtracted: (f: ExtractedFile, a: Attachment) => {
      logOcrDebug(f, logConv(convId));
      if (f.text.trim()) redactAttachment(a, convId ? { ...redactDeps, convId } : redactDeps);
    },
  });
  function addDroppedFiles(files: DeferredFile[]) {
    for (const d of files) void stageDeferredFile(d, undefined, deferredDeps());
  }

  const canOcrAll = !!host.files?.extractAll;
  function handleOcrAll(cid: string) {
    const a = att.attachments.find((x) => x.cid === cid);
    if (!a || !host.files?.extractAll) return;
    void ocrAllAttachment(
      {
        files: { extractAll: host.files.extractAll.bind(host.files) },
        patch: (c, patch) => patchStaged(c, patch),
        countMatches: (t) => countMatches(t),
        onExtracted: (f, merged) => {
          logOcrDebug(f, logConv(conversation?.id));
          if (f.text.trim()) redactAttachment(merged, redactDeps);
        },
      },
      a,
    );
  }

  const grantFolder = useGrantFolder();

  async function attach() {
    if (!host.files) return;
    try {
      // Placeholder chips INSTANTLY, extraction async, so a slow OCR doesn't delay the file's appearance.
      if (host.files.pickPaths) {
        const picked = await host.files.pickPaths();
        if (!picked.length) return;
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
        host.files
          .extract(picked.map((f) => f.path), (prog) => {
            const ph = placeholders.find((x) => x.name === prog.name);
            if (ph) updateAttachment(ph.cid, { extractProgress: { done: prog.page, total: prog.pages } });
          })
          .then((extracted) => {
            placeholders.forEach((ph, i) => {
              const f = extracted[i];
              if (!f) {
                updateAttachment(ph.cid, { extracting: false, error: "extraction échouée" });
                return;
              }
              const merged: Attachment = { ...ph, ...f, extracting: false, redactPreview: countMatches(f.text) };
              updateAttachment(ph.cid, {
                ...f,
                extracting: false,
                extractProgress: undefined,
                redactPreview: merged.redactPreview,
                redacting: !!f.text.trim(),
              });
              logOcrDebug(f, logConv());
              if (f.error) setAttachWarning(`${f.name}: ${f.error}`);
              else if (f.text.trim()) redactAttachment(merged, redactDeps);
            });
          })
          .catch((e) => {
            placeholders.forEach((ph) => updateAttachment(ph.cid, { extracting: false, error: "extraction échouée" }));
            setAttachWarning(e instanceof Error ? e.message : String(e));
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
    if (isDeferredFile(file)) void stageDeferredFile(file, convId, deferredDeps(convId));
    else addExtractedFiles([file], convId);
    onPendingConsumed?.();
  }, [pendingAttachment]);

  return {
    canAttach: !!host.files,
    attach,
    addDroppedFiles,
    canOcrAll,
    handleOcrAll,
    onAddFolder: grantFolder.canAdd ? () => void grantFolder.addFolder() : undefined,
  };
}

export type AttachmentIntakeApi = ReturnType<typeof useAttachmentIntake>;
