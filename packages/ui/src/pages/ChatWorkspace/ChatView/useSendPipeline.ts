import { useRef } from "react";
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
import { planSubmit } from "../submitPlan";

interface Deps {
  input: string;
  clearInput: () => void;
  activeStreaming: boolean;
  att: AttachmentsApi;
  forced: ForcedRedactionsApi;
  intents: IntentChipsApi;
  gates: PendingGatesApi;
}

/** The send: what leaves the composer, with which gates, and the reset that follows. */
export function useSendPipeline(p: ChatViewProps, d: Deps) {
  const { conversation, settings, orgProfile, onSend } = p;
  // Values the user chose to KEEP IN CLEAR via the composer's un-redact chips.
  const keepListRef = useRef<string[]>([]);

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

  function submit() {
    const { attachments } = d.att;
    const text = d.input.trim();
    const usable = attachments.filter((a) => a.text.trim());
    if ((!text && usable.length === 0) || d.activeStreaming) return;
    // Never send while a file's redaction is unfinished or failed.
    if (attachments.some((a) => a.redacting)) {
      d.att.setAttachWarning("Redaction du fichier en cours — patientez avant d'envoyer.");
      return;
    }
    const failed = attachments.find((a) => a.redactError);
    if (failed) {
      d.att.setAttachWarning(failed.redactError!);
      return;
    }
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

  return { runSend, submit, setKeepList: (k: string[]) => (keepListRef.current = k) };
}

export type SendPipelineApi = ReturnType<typeof useSendPipeline>;
