import { useCallback, useRef, type MutableRefObject } from "react";
import type { ExtractedFile } from "../../host";
import type { Conversation } from "../../types";
import { loadReattachFile } from "../../pages/Library/reattach";
import { askTargetLaunchText } from "../../send/askTarget";
import { retryResendWire, retryTagPrompt } from "../../send/retryResend";
import { createSendMessage, type SendMessageDeps } from "../../send/sendOrchestrator";

type CancelMap = MutableRefObject<Map<string, () => void>>;

/**
 * `sendMessage` lives in `send/sendOrchestrator.ts`; the capture bag is built HERE,
 * inside the `useCallback`, with the historic dependency list — the values the send sees
 * are those of the render that (re)created the callback. `conversations` is a dependency
 * without entering the bag: it only serves to re-create the callback.
 */
export function useSendPipeline(deps: SendMessageDeps & { conversations: Conversation[]; activeIdRef: MutableRefObject<string | null> }) {
  const { conversations, activeIdRef, ...bag } = deps;
  const { host, settings, activeId, keyConfigured, createConversation, patchConversation, cancelRef, finishRef } = bag;

  const sendMessage = useCallback(
    (...args: Parameters<ReturnType<typeof createSendMessage>>) => createSendMessage(bag)(...args),
    [host, activeId, conversations, settings, keyConfigured, createConversation, patchConversation],
  );
  // `regenerate` must call the version bound to the LATEST conversations (after it
  // removes the failed turn), never a stale closure.
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  /**
   * Retry a FAILED assistant turn IN PLACE: drop the errored assistant AND its user
   * message (so the text is never sent twice), then re-send the user's text and its
   * documents. A message persists only its attachments' METADATA, so the documents are
   * rebuilt from the library by name; when that recovers no text (file never stored, no
   * DB, extraction failed), the turn's persisted `modelContent` is re-sent verbatim as the
   * wire — the same source a normal follow-up turn re-includes.
   */
  const regenerate = useCallback(
    async (assistantId: string, targetConvId?: string) => {
      const convId = targetConvId ?? activeId;
      const conv = conversations.find((c) => c.id === convId);
      if (!conv) return;
      const idx = conv.messages.findIndex((m) => m.id === assistantId);
      if (idx < 1) return;
      const user = conv.messages[idx - 1];
      if (user.role !== "user") return;
      const text = user.content;
      const attachMeta = user.attachments ?? [];
      patchConversation(convId!, (c) => ({
        ...c,
        messages: c.messages.filter((m) => m.id !== assistantId && m.id !== user.id),
      }));
      let files: ExtractedFile[] | undefined;
      if (attachMeta.length && host.db?.listFiles && host.db?.loadFile) {
        try {
          const names = new Set(attachMeta.map((a) => a.name));
          const metas = (await host.db.listFiles(convId!)).filter((m) => names.has(m.name));
          const loaded = await Promise.all(
            metas.map((m) => loadReattachFile(host, { id: m.id, name: m.name, mime: m.mime }).catch(() => null)),
          );
          const ok = loaded.filter((f): f is ExtractedFile => f !== null);
          if (ok.length) files = ok;
        } catch {
          /* library unavailable → fall back to a text-only retry */
        }
      }
      const resendWire = retryResendWire(text, user.modelContent, files);
      // With a `resendWire` the compétence rides for its TAG only (the instruction is
      // already inside it); without one, `retryTagPrompt` re-supplies the prompt — snapshot
      // first, else today's version. `competence ?? workflow`: an old turn from the
      // two-list era must go out again with its instruction, not as bare text.
      const tag = user.competence ?? user.workflow;
      const compPromptRetry = tag
        ? retryTagPrompt(resendWire, tag.prompt, settings.competences?.find((c) => c.id === tag.id)?.prompt)
        : undefined;
      const atPromptRetry = user.askTarget
        ? retryTagPrompt(resendWire, user.askTarget.prompt, askTargetLaunchText(user.askTarget))
        : undefined;
      // Let the removal flush to state first, so the resent turn's history excludes it.
      setTimeout(
        () =>
          void sendMessageRef.current(text, resendWire ? undefined : files, {
            plotTag: user.plotTag,
            ...(tag ? { competence: { id: tag.id, name: tag.name, prompt: compPromptRetry, servers: tag.servers } } : {}),
            ...(user.askTarget ? { askTarget: { ...user.askTarget, prompt: atPromptRetry } } : {}),
            ...(resendWire ? { resendWire } : {}),
            // Same turn id, so write-idempotency keys match: an action that already
            // succeeded before the failure is recognised and not repeated.
            ...(user.turnId ? { resendTurnId: user.turnId } : {}),
          }),
        0,
      );
    },
    [activeId, conversations, patchConversation, host, settings.competences],
  );

  const stop = useCallback((targetConvId?: string) => stopTurns(cancelRef, finishRef, targetConvId ?? activeIdRef.current, !!targetConvId), []);

  return { sendMessage, regenerate, stop };
}

/**
 * Cancel + finalize ONE conversation's turn (tabs generate independently, so Stop must
 * reach the turn the user is watching). Keys are cleared first so a late transport event
 * can't re-run it; `finish` resolves the stream for transports without a completion event.
 * With no explicit target and a focused tab that isn't generating, halt every turn.
 */
function stopTurns(cancelRef: CancelMap, finishRef: CancelMap, id: string | null, explicit: boolean) {
  const runOne = (key: string) => {
    const cancel = cancelRef.current.get(key);
    const finish = finishRef.current.get(key);
    cancelRef.current.delete(key);
    finishRef.current.delete(key);
    cancel?.();
    finish?.();
  };
  if (id && (cancelRef.current.has(id) || finishRef.current.has(id))) {
    runOne(id);
    return;
  }
  if (explicit) return;
  for (const key of new Set([...cancelRef.current.keys(), ...finishRef.current.keys()])) runOne(key);
}
