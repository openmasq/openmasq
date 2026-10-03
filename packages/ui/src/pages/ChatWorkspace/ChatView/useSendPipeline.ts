import { useRef, useState } from "react";
import { useT } from "../../../i18n";
import { captureEvent } from "../../../analytics";
import { findModelAny } from "../../../prompt/models";
import { askTargetLaunchText } from "../../../send/askTarget";
import type { ReviewWire } from "../../../send/redactionPreview";
import { DRAFT_CONV, pushDebug } from "../../../state/debug/debug";
import { sendErrorReason } from "../../../state/errors";
import { httpStatus, requestIdOf, retriesOf } from "../../../state/errors/fields";
import type { Attachment } from "../Composer";
import { reusableDocReplacements } from "../reusableDocReplacements";
import type { AttachmentsApi } from "./useAttachments";
import type { ForcedRedactionsApi } from "./useForcedRedactions";
import type { IntentChipsApi } from "./useIntentChips";
import type { PendingGatesApi } from "./usePendingGates";
import type { ChatViewProps, RunSendOpts } from "./types";
import { checkSubmit } from "../submitGuard";
import { planSubmit } from "../submitPlan";

interface Deps {
  input: string;
  clearInput: () => void;
  activeStreaming: boolean;
  att: AttachmentsApi;
  forced: ForcedRedactionsApi;
  intents: IntentChipsApi;
  gates: PendingGatesApi;
  /** The model this send goes to (the conversation's, else the default; « auto » allowed). */
  modelId?: string;
}

/** The send: what leaves the composer, with which gates, and the reset that follows. */
export function useSendPipeline(p: ChatViewProps, d: Deps) {
  const { conversation, settings, orgProfile, onSend } = p;
  // Values the user chose to KEEP IN CLEAR via the composer's un-redact chips.
  const keepListRef = useRef<string[]>([]);
  const t = useT();
  // The files the open « send without them? » dialog names; null ⇒ no dialog.
  const [unreadConfirm, setUnreadConfirm] = useState<string[] | null>(null);

  const runSend = async (text: string, usable: Attachment[], opts?: RunSendOpts) => {
    d.att.setAttachWarning(null);
    try {
      // The review resolves IMMEDIATELY, un-redacting exactly the values the user kept in
      // clear — composer chips OR a click in a DOCUMENT preview. Case-INSENSITIVE, like the
      // engine's own `isKept`. `keepValues` also stops a deselected span from being redacted
      // in the first place; the exact-value restore alone missed casing variants.
      const keptLower = new Set(
        [...keepListRef.current, ...usable.flatMap((a) => a.reveal ?? [])].map((v) => v.toLowerCase()),
      );
      const reviewWire: ReviewWire = (r) =>
        Promise.resolve({
          restoreTokens: r.matches.filter((m) => keptLower.has(m.value.toLowerCase())).map((m) => m.placeholder),
        });
      const keepValues = [...keepListRef.current, ...d.forced.docDeletedRef.current];
      await onSend(text, usable, {
        ...opts,
        keepValues,
        reviewWire,
        confirmToolWrite: d.gates.confirmToolWrite,
        reviewWebNav: d.gates.reviewWebNav,
      });
    } catch (e) {
      // A BOUNDED reason code for analytics, never the raw message. The store persists every
      // send failure inline on the bubble; this catch is a Debug-Log breadcrumb only.
      const m = conversation ? findModelAny(conversation.modelId) : undefined;
      captureEvent({
        name: "send_error",
        provider: m?.provider ?? "unknown",
        model: conversation?.modelId ?? "unknown",
        reason: sendErrorReason(e),
        status: httpStatus(e),
        requestId: requestIdOf(e),
        retries: retriesOf(e),
      });
      pushDebug(
        { type: "error", scope: "send", message: e instanceof Error ? e.message : String(e) },
        conversation?.id ?? DRAFT_CONV,
      );
    }
  };

  // The drop-time redaction the send can REUSE, bound to this conversation's rules.
  const reuseDocReplacements = (list: Attachment[]) =>
    reusableDocReplacements(list, conversation?.redactCategories, settings, d.forced.forcedValues, orgProfile?.forcedCategories);

  /** `accepted`: the unreadable files the user just agreed to send WITHOUT (the dialog's names). */
  function submit(accepted?: string[]) {
    const { attachments } = d.att;
    const text = d.input.trim();
    if (d.activeStreaming) return;
    // Never drop a file silently (`submitGuard.ts`): one still read or masked refuses, one
    // with nothing to send is named first, a message too big for the model refuses before
    // masking. A refusal clears NOTHING — draft and chips stay.
    const check = checkSubmit({ text, attachments, t, accepted, modelId: d.modelId });
    if (check.kind === "idle") return;
    if (check.kind === "refuse") {
      d.att.setAttachWarning(check.warning);
      return;
    }
    if (check.kind === "confirm") {
      setUnreadConfirm(check.unread);
      return;
    }
    setUnreadConfirm(null);
    // Read the staged intents BEFORE the reset below; both send paths carry them.
    const { activeSkill, activeTarget, activeTag } = d.intents;
    const competence = activeSkill
      ? { id: activeSkill.id, name: activeSkill.name, prompt: activeSkill.prompt, servers: activeSkill.servers }
      : undefined;
    const askTarget = activeTarget ? { ...activeTarget, prompt: askTargetLaunchText(activeTarget) } : undefined;
    // ONE option bag for both shapes of a send (`submitPlan.ts`, pure + tested): the
    // pre-conversation manual redactions ride it whether or not a document is attached —
    // a document is the surface where one is most often made.
    const plan = planSubmit({
      attachments,
      hasConversation: !!conversation,
      pendingForced: d.forced.pendingForced,
      skill: competence,
      askTarget,
      plotTag: activeTag?.tag,
      reuseDocReplacements,
    });
    d.clearInput();
    d.intents.resetAll();
    d.forced.clearPendingForced();
    d.att.setAttachments([]);
    void runSend(text, plan.files, plan.opts);
  }

  return {
    runSend,
    submit: () => submit(),
    // The dialog's « Envoyer sans eux » re-runs the WHOLE gate: a file that changed meanwhile is re-checked.
    unreadConfirm,
    confirmUnread: () => {
      if (unreadConfirm) submit(unreadConfirm);
    },
    cancelUnread: () => setUnreadConfirm(null),
    setKeepList: (k: string[]) => (keepListRef.current = k),
  };
}

export type SendPipelineApi = ReturnType<typeof useSendPipeline>;
