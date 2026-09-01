import type { Messages } from "@openmasq/i18n";

import { redactNumbersOn } from "../send/redactNumbers";
import { contextWindow, isFreeModel, supportsTools } from "@openmasq/llm";
import type { StreamDone, LlmAttachment, ChatMessage } from "@openmasq/llm";
import type { AskTarget, Conversation, Message, RedactCategoryKey, Settings, } from "../types";
import { combinedVaultTerms } from "./vaultTerms";
import { featureUsage } from "../state/billing/featureAccess";
import { selectMemory, memoryForcedForBlock, memoryForcedAll, filterNotoriousFromForced, searchMemoryHybrid } from "../memory";
import { skillLaunchText, activeSkillScope } from "../skills/launch";
import {
  unredact, unredactReply,
  unredactArgs,
  applyVault,
  pseudonymize,
  computeTokenFormulas,
  disabledVaultTokens,
  type Vault,
  type RedactionMatch,
} from "@openmasq/redact";
import { webNavOfferableCategories, webNavRevealSet } from "../state/browserPolicy/webNavReveal";
import { bytesToBase64, base64ToBytes } from "../state/files/bytes";
import { preflightError } from "../send/preflight";
import { estimateTurnUsage } from "../send/estimateUsage";
import { fetchPlatformToken } from "../send/tokenFetch";
import { platformTokenFailure } from "../send/platformTokenMessage";
import { buildFoldedPayload } from "../send/foldPayload";
import { resolveEffectivePlatform } from "../send/routing";
import { buildModelLatencyEvent } from "../send/modelLatency";
import { appendReusedDocsWire } from "../send/reusedDocsWire";
import { loadPythonSeeds } from "../send/pythonSeeds";
import { uniqueFileName } from "../send/generatedFiles";
import { deriveRedactedSpans, buildSendAnalyticsEvents, redactionFailReason } from "../send/sendAnalytics";
import { httpStatus, requestIdOf, retriesOf } from "../state/errors/fields";
import {
  effectiveRedactCategories,
  disabledKindsOf,
  convKindsFromSpans,
  avoidBlob,
  sendKeepList,
  buildSendEngineContext,
  sendForcedList,
  toolForcedList,
  shouldRedactSystemPrompt,
} from "../send/redactionOptions";
import { levelOf, notorietyForLevel } from "../privacy/privacyLevel";
import { isAutoModelId, resolveAutoModel } from "../send/autoRoute";
import { asksConsultNotAct } from "../agent/readIntent";
import { buildSystemContent, buildWireHistory } from "../send/buildWire";
import { makeRedactToolResult } from "../send/toolResult";
import { applyRestore, type ReviewWire } from "../send/redactionPreview";
import {
  RedactionUnavailableError,
  isRateLimitError,
  humanizeSendError,
  sendErrorAction,
  cleanErrorText,
  sendErrorReason,
} from "../state/errors";
import { runMcpAgentLoop, type WriteConfirmInfo, type McpAgentParams } from "../agent/mcpAgent";
import { isBrowserTool } from "../state/browserPolicy";
import { toolActionLabel } from "../agent/toolActionLabel";
import { rememberTranscript, resumeMessagesFor, type TurnCheckpoint } from "../agent/turnCheckpoint";
import { reasoningRelay } from "../state/conversation/reasoningRelay";
import { fitHistoryToContext } from "../send/historyWindow";
import { pushDebug, updateDebug, adoptDraftDebug } from "../state/debug/debug";
import { logWireMessage } from "../state/debug/wireTrace";
import { captureEvent, captureError, bucket } from "../analytics";
import {
  type ExtractedFile,
  type OrgProfileInfo,
  type CreditBalance,
  type BillingSubscription,
  type Host,
} from "../host";
import { describeRedactFailure } from "../send/redaction";
import { redactTimeoutMs } from "../send/redactTimeout";
import { makeRedactFn, raceRedactionWork } from "../send/redactionEngine";
import { attachmentDetectBlock } from "../send/attachmentLayers";
import {
  ALL_MODELS,
  DEFAULT_MODEL_ID,
  findModelAny,
  resolveRedactModel,
  selectableModels,
} from "../prompt/models";
import {
  pickAttachmentMetas,
  redactEngineUnavailable,
} from "../send/sendGuards";
import {
  DEFAULT_SETTINGS,
  newConversation,
  uid,
} from "../state/storePersistence";
import { isNerWarmed, markNerWarmed } from "../state/redaction/nerWarm";
import { BRAND } from "@openmasq/branding";
import { mintRedactionKey } from "./redactionKey";

// The three MODULE constants only the send consumed — moved along with it.
// The tool NARRATOR's instruction (the "Searching…" phrase from the loader).
const TOOL_SUMMARY_TIMEOUT_MS = 6000;

/**
 * EVERYTHING the send captures from the `useChatStore` component — the map the
 * closure was hiding. One entry per value/ref/setter; the PURE helpers, though,
 * import normally. The store builds this bag in its useCallback with the SAME
 * dependencies as before: unchanged capture semantics.
 */
export interface SendMessageDeps {
  host: Host;
  settings: Settings;
  activeId: string | null;
  keyConfigured: Set<string>;
  patchConversation: (id: string, patch: (c: Conversation) => Conversation) => void;
  createConversation: () => string;
  forceRedact: (value: string, category: string, convId?: string) => void;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  setBrowserActivity: React.Dispatch<React.SetStateAction<number>>;
  conversationsRef: React.MutableRefObject<Conversation[]>;
  cancelRef: React.MutableRefObject<Map<string, () => void>>;
  finishRef: React.MutableRefObject<Map<string, () => void>>;
  resumeTranscriptsRef: React.MutableRefObject<Map<string, ChatMessage[]>>;
  orgProfileRef: React.MutableRefObject<OrgProfileInfo | null>;
  personalSubRef: React.MutableRefObject<BillingSubscription | null>;
  personalCreditsRef: React.MutableRefObject<CreditBalance | null>;
  keepListRef: React.MutableRefObject<string[]>;
  localEndpointReachableRef: React.MutableRefObject<boolean | null>;
  /** `claude-cli` ready (setting ON + CLI detected) — ref mirror, same reasons. */
  claudeCliReadyRef: React.MutableRefObject<boolean | null>;
  /** Same for `codex-cli`. */
  codexCliReadyRef: React.MutableRefObject<boolean | null>;
  /** Same for `antigravity-cli`. */
  antigravityCliReadyRef: React.MutableRefObject<boolean | null>;
  /** The INTERFACE-LANGUAGE catalogue: the failure phrases persisted on the bubble,
   *  and the tool-summary instruction — whose OUTPUT shows in the chrome. */
  t: Messages;
}

export function createSendMessage(d: SendMessageDeps) {
  const {
    t,
    host,
    settings,
    activeId,
    keyConfigured,
    patchConversation,
    createConversation,
    forceRedact,
    setIsStreaming,
    setBrowserActivity,
    conversationsRef,
    cancelRef,
    finishRef,
    resumeTranscriptsRef,
    orgProfileRef,
    personalSubRef,
    personalCreditsRef,
    keepListRef,
    localEndpointReachableRef,
    claudeCliReadyRef,
    codexCliReadyRef,
    antigravityCliReadyRef,
  } = d;
  return (
    async (
      text: string,
      attachments?: ExtractedFile[],
      // When the user chose "send the redacted document as a FILE": the redacted
      // page IMAGES to attach to the model turn (`imageAttachments`) and the names
      // of the attachments sent that way (`imageNames`) — so their extracted text
      // is NOT also folded into the wire. Requires a vision model (gated upstream).
      opts?: {
        imageAttachments?: LlmAttachment[];
        imageNames?: string[];
        modelId?: string;
        fileVault?: Record<string, string>;
        // A text-folded document's DROP-TIME redaction (real→fake+tone), keyed by file
        // name — reused deterministically at send instead of re-detecting the whole
        // document a second time (the double pass that delayed the reply). Only passed by
        // ChatView when the file's redaction is complete + engine/category-current, so it
        // is safe to trust; docs absent here fall back to fresh detection.
        docReplacements?: Record<string, { real: string; fake: string; tone?: string }[]>;
        // Values the user KEPT IN CLEAR via the composer chips (deselected a detected
        // span). Merged into the redaction `keep` allow-list so they're NEVER redacted
        // at send time (case-insensitive) — the belt to reviewWire's post-hoc restore.
        keepValues?: string[];
        // Manual redactions from the composer's text-selection "Redact" menu,
        // applied to THIS send (used before the conversation exists — once it does,
        // they live on `Conversation.forcedRedactions`). Each `{value, category}` is
        // force-redacted as the chosen canonical token.
        forcedRedactions?: { value: string; category: string }[];
        // Pre-send review hook (ChatView): shows the redacted wire so the user can
        // un-redact spans before it's sent. Resolves with the tokens to reveal, or
        // null to cancel the send.
        reviewWire?: ReviewWire;
        // Per-tool confirmation (ChatView): the agentic loop awaits this before running
        // a call it won't run silently. Resolves true=run, false=skip. `WriteConfirmInfo`
        // is IMPORTED, never re-declared — the loop OWNS the shape, and a local copy that
        // drops `reason`/`flags` silently strands them (rule 9).
        // `convId` is the turn's OWN conversation, threaded because turns run concurrently
        // per tab: the renderer must never resolve this promise from a decision (or a
        // dismissal) that belongs to a DIFFERENT conversation. It is routing, not display,
        // so it rides beside `WriteConfirmInfo` rather than inside it — the card renders
        // the info verbatim and has no business reading an id.
        confirmToolWrite?: (info: WriteConfirmInfo, convId: string) => Promise<boolean>;
        // Pre-search REVEAL gate (ChatView opens an inline card): asked ONCE, the first
        // time a conversation uses a web-search/browser tool. `categories` = the
        // offerable subset the store computed; resolves with the SUBSET the user chose to
        // stop redacting for this conversation (`[]` = reveal none, the fail-closed
        // default). This decides what the MODEL sees — never what the browser sends.
        reviewWebNav?: (
          categories: RedactCategoryKey[],
          convId: string,
        ) => Promise<RedactCategoryKey[]>;
        // Text-selection → menu tag. "graphique" (Générer un graphique) prepends a
        // run_python directive + FORCES the code interpreter for THIS send (even if
        // the global toggle is off). "preciser" is a plain send (no special handling).
        plotTag?: "graphique" | "preciser";
        // A COMPÉTENCE used for this send. Its `prompt` rides the MODEL payload only
        // (like the plot directive), so the composer and the sent bubble show a tag
        // rather than the raw instruction. It goes through the SAME redaction as the
        // typed text — it is part of `modelText`, never appended past the engine.
        // `prompt` is absent on a RETRY: the instruction already rides `resendWire`
        // (the prior turn's `modelContent`), so re-prefixing it would send it twice.
        // `servers` (when it carries any) appends to the prefix the instruction line that
        // NAMES the connectors, and WIDENS the turn's tool scope — this was the last
        // behavioural difference remaining between a compétence and a "workflow", and
        // it is now a field, not a second send option.
        competence?: { id: string; name: string; prompt?: string; servers?: string[] };
        // The folder/file this send is ABOUT (« Demander » in the right rail) — staged
        // EXACTLY like a compétence (a tag, never draft text). Its `prompt` (the context
        // line ChatView minted via `send/askTarget.ts`) rides the MODEL payload only,
        // through the same redaction as typed text. Same retry rule: `prompt` absent on
        // a retry (the line already rides `resendWire`).
        askTarget?: AskTarget;
        // Tool-routing/catalog threshold override, straight through to
        // `runMcpAgentLoop`. NEVER set by a real caller (ChatView) — only the eval
        // bench passes one to sweep prompt-size strategies (`evals/strategies.ts`).
        // Undefined ⇒ today's hardcoded defaults, unchanged.
        routingConfig?: McpAgentParams["routingConfig"];
        // Target conversation for this send. Defaults to the focused `activeId`; a
        // SPLIT PANE passes its own conversation id so a send from a non-focused pane
        // lands in that pane's conversation (not whichever tab currently has focus).
        convId?: string;
        // RETRY path: the ORIGINAL model payload (a prior turn's `modelContent` —
        // typed text PLUS the attached document(s)' folded text) to re-send VERBATIM
        // as the wire, while `text` stays the clean displayed content. `regenerate`
        // uses it so a retried turn re-includes its document reliably (via the
        // persisted vault, exactly like a normal follow-up turn at the history-build
        // step) instead of depending on rebuilding the file from the library — which
        // silently drops the document when the file was never stored (redaction off),
        // the DB is absent, extraction fails, or the name doesn't match. When set,
        // NO attachment text is folded (it's already in `resendWire`), so pass only
        // metadata-only chip attachments to avoid double-folding the document.
        resendWire?: string;
        // RETRY path: reuse the FAILED turn's `turnId` so write-idempotency keys match
        // across the retry — a side-effecting call that already succeeded in the failed
        // attempt is recognised (via `Conversation.writeLedger`) and NOT repeated. Absent
        // on a normal send (a fresh turnId is minted). See `agent/writeIdempotency.ts`.
        resendTurnId?: string;
      },
    ) => {
      // "Graphique" tag: force the code interpreter for this send and steer the model
      // to run_python. The directive is prepended to the MODEL payload ONLY (below),
      // never to `text` — so the displayed bubble stays the user's clean selection
      // (with a "Graphique" tag chip), not the verbose instruction. Only when the host
      // has the interpreter.
      const forcePython = opts?.plotTag === "graphique" && !!host.python;
      const plotPrefix = forcePython
        ? "Génère un graphique à partir des données ci-dessous en exécutant du code " +
          "Python (utilise l'outil run_python avec **seaborn/matplotlib** ; la figure s'affiche " +
          "automatiquement, pas besoin de plt.show()) :\n\n"
        : "";
      // A COMPÉTENCE rides the model payload the same way: the user picked a template,
      // so the instruction leads and what they typed reads as its input. It is NOT put
      // in `text`, so the bubble shows a tag instead of the whole prompt.
      // ⚠️ The prefix goes through `competenceLaunchText`, NEVER the bare prompt: it is
      // what adds the line naming the connectors and the one for `{braces}` to
      // fill in. With no `servers` and no braces it renders the prompt as-is — so a
      // prose compétence goes out exactly as before.
      const compPrompt = opts?.competence?.prompt?.trim();
      const compPrefix = compPrompt
        ? `${skillLaunchText({ prompt: compPrompt, servers: opts?.competence?.servers ?? [] })}\n\n`
        : "";
      // The « Demander » target's context line leads (it SITUATES the question — the
      // clicked folder/file, its service or local path) — model payload only, so the
      // bubble shows the target as a tag instead of the instruction.
      const atPrompt = opts?.askTarget?.prompt?.trim();
      const atPrefix = atPrompt ? `${atPrompt}\n\n` : "";
      const modelPrefix = atPrefix + plotPrefix + compPrefix;
      // Target conversation: an explicit `opts.convId` (a split pane sends into ITS
      // OWN conversation, not the globally-focused one) else the focused `activeId`.
      // Everything downstream uses this local `convId`, so this is the single point
      // that binds the whole send to a conversation.
      let convId = opts?.convId ?? activeId;
      if (!convId) {
        convId = createConversation();
        // This first send MATERIALISES the conversation: the DRAFT's log entries
        // (OCR/redaction of files dropped before sending — `ocrDebug.ts`)
        // belong to it. Re-keyed here, at the single creation point.
        adoptDraftDebug(convId);
      }
      // Every Debug-Log entry from this send is stamped with the conversation, so the
      // journal is scoped per conversation (a second tab's send never bleeds in).
      const dbg = (e: Parameters<typeof pushDebug>[0]): string => pushDebug(e, convId);

      // Persist any manual redactions passed for THIS send (the pre-conversation
      // first message) onto the conversation, so they keep applying to later messages.
      for (const f of opts?.forcedRedactions ?? []) forceRedact(f.value, f.category, convId);

      // The LIVE list, not the captured `conversations` — create-then-send in one handler
      // leaves it behind, and the fallback answers on the default model (its own test pins it).
      const conv =
        conversationsRef.current.find((c) => c.id === convId) ?? newConversation(DEFAULT_MODEL_ID);
      // `opts.modelId` lets a caller send with a just-switched model without racing
      // the persisted state. AUTO mode: the sentinel is resolved HERE, on every send,
      // by `send/autoRoute.ts` (pure + tested) — local signals, candidates bounded by
      // the SAME `modelUnavailableReason` as the gate (rule 9, re-checked further below),
      // and `autoPick.billing` stamped on the bubble: the metered escalation is EXPLICIT.
      const requestedModelId = opts?.modelId ?? conv.modelId;
      const autoPick = isAutoModelId(requestedModelId)
        ? resolveAutoModel(
            selectableModels(orgProfileRef.current?.allowedModelIds),
            {
              text,
              attachmentChars: (attachments ?? []).reduce((n, a) => n + (a.chars || 0), 0),
              hasImages: !!opts?.imageAttachments?.length,
              usesConnectors: !!(host.mcp && host.completeTools) && keepListRef.current.length > 0,
              forcesCode: opts?.plotTag === "graphique",
              consultOnly: asksConsultNotAct(text),
            },
            {
              billingMode: settings.billingMode,
              keyConfigured,
              orgProfile: orgProfileRef.current,
              personalCredits: personalCreditsRef.current,
              personalSub: personalSubRef.current,
              openaiCompatBaseUrl: settings.openaiCompatBaseUrl,
              localEndpointReachable: localEndpointReachableRef.current,
              claudeCliReady: claudeCliReadyRef.current,
              codexCliReady: codexCliReadyRef.current,
              antigravityCliReady: antigravityCliReadyRef.current,
            },
          )
        : null;
      const model =
        autoPick?.model ??
        findModelAny(isAutoModelId(requestedModelId) ? DEFAULT_MODEL_ID : requestedModelId) ??
        ALL_MODELS[0];
      const provider = model.provider;

      // Model response-latency telemetry (declared at the send scope so BOTH the
      // agentic and plain-stream paths share it). `mT0` = the model-dispatch instant
      // (reset just before each dispatch, so the redaction pre-pass isn't counted),
      // `mTFirst` = the first streamed token → TTFT; throughput = output / gen-time.
      let mT0 = 0;
      let mTFirst = 0;
      const emitModelLatency = (
        t0: number,
        tFirst: number,
        output: number,
        tools: boolean,
        toolCount: number,
        inputTokens: number,
      ) => {
        // Pure event build (send/modelLatency.ts) — null when there's nothing to report
        // (no dispatch / no first token). Emits even for a TOOL-FIRST turn (output 0).
        const e = buildModelLatencyEvent({
          provider,
          model: model.id,
          t0,
          tFirst,
          output,
          tools,
          toolCount,
          inputTokens,
          nowMs: Date.now(),
        });
        if (e) captureEvent(e);
      };

      // Show the user's message + a pending assistant bubble IMMEDIATELY — before the
      // pre-flight gate, before the platform-token fetch, before the redaction pass.
      // EVERY refusal below patches this pair rather than appending its own, so the
      // message the user just typed is on screen within a frame whatever happens next.
      // That ordering is the fix for a real bug: the token fetch waits up to
      // PLATFORM_TOKEN_TIMEOUT_MS (5 s) on an unreachable auth server, and appending the
      // pair only on failure left the composer cleared and the thread EMPTY for those
      // seconds — the send looked lost. The bubble renders the ORIGINAL text; the wire
      // payload is still built from the redacted result far below, so nothing leaves the
      // machine un-scrubbed by showing it early.
      const sentAt = Date.now();
      // Idempotency turn id: a fresh one per send, but a RETRY reuses the failed turn's id
      // (`resendTurnId`) so write-idempotency keys match and an already-completed action
      // isn't repeated (see `agent/writeIdempotency.ts` + `Conversation.writeLedger`).
      const turnId = opts?.resendTurnId ?? uid();
      const userMsg: Message = {
        id: uid(),
        role: "user",
        at: sentAt,
        turnId,
        // Displayed content is the CLEAN user text only — the attached files show
        // as chips (their text is folded into the model payload below, not here).
        content: text,
        attachments: attachments?.length
          ? attachments.map((a) => ({ name: a.name, kind: a.kind, mime: a.mime }))
          : undefined,
      };
      const assistantMsg: Message = {
        id: uid(),
        role: "assistant",
        at: sentAt,
        turnId,
        content: "",
        pending: true,
        // Pin the answering model so its logo/name stay on this reply even after
        // the user switches the conversation's model.
        model: model.id,
        // AUTO mode: the billing of the routed choice — the metered escalation is stated.
        ...(autoPick ? { autoRouted: autoPick.billing } : {}),
      };

      const isFirst = conv.messages.length === 0;
      patchConversation(convId, (c) => ({
        ...c,
        title: isFirst
          ? text.slice(0, 48) || attachments?.[0]?.name || c.title
          : c.title,
        messages: [...c.messages, userMsg, assistantMsg],
        updatedAt: Date.now(),
      }));

      // STOP from the very first second. The `pending` bubble above SHOWS the Stop
      // button immediately, but the stream and the tool loop only set their own
      // cancellation into `cancelRef` much later — any Stop clicked during the
      // redaction/memory/layers phases (up to ~45s of apparent "thinking" on the
      // remote engine) was a silent NO-OP. This controller covers that window:
      // `stop()` aborts it, the remote-redaction fetches receive its signal, and
      // every phase boundary goes through `stoppedEarly()`. The stream/tool paths
      // then REPLACE this entry with their own (phase handoff).
      const sendAbort = new AbortController();
      cancelRef.current.set(convId, () => sendAbort.abort());
      /** True if the user stopped during a pre-model phase — then resolves the
       *  bubble (honest: nothing has gone to the MODEL yet) and signals to abandon. */
      const stoppedEarly = (): boolean => {
        if (!sendAbort.signal.aborted) return false;
        patchConversation(convId!, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, pending: false, error: true, errorText: t.errors.interruptedBeforeSend }
              : m,
          ),
          updatedAt: Date.now(),
        }));
        setIsStreaming(false);
        return true;
      };

      // A send that fails a PRE-FLIGHT check (suspended, org-blocked model, no
      // credits, missing key, not signed in) is shown INLINE as a failed turn: the
      // user's message stays put with an error + "Réessayer" (which regenerates in
      // place — no duplicate send) and, when relevant, a CTA (e.g. missing key).
      // No transient banner.
      //
      // It PATCHES the bubble appended above — it does not append its own pair. Same
      // shape as the redaction fail-closed patch and the stream `onError` path, so a
      // turn that fails has ONE representation whatever killed it, and an awaited
      // refusal (the 5 s token fetch) resolves a bubble the user is already looking at
      // instead of materialising a second copy of their message.
      const failTurn = (errorText: string, errorAction?: Message["errorAction"]) => {
        // The log ALSO: preflight (org/credits/key), platform token, salt — a
        // send refused here left NO entry at all, and "send blocked: no more
        // credits" was debugged against an entirely empty log (audit 13/08).
        dbg({ type: "error", scope: "preflight", message: errorText });
        patchConversation(convId!, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, pending: false, error: true, errorText, ...(errorAction ? { errorAction } : {}) }
              : m,
          ),
          updatedAt: Date.now(),
        }));
      };

      // Routing decision: a platform provider (Scaleway/OpenRouter) is proxied through
      // the app's metered gateway/credits UNLESS the user configured that provider's OWN
      // key (OpenRouter) — the billing-mode switch (Settings → Compte) can FORCE the
      // gateway ("subscription") even when a key exists. Used by the pre-flight gate AND
      // the platform-token block below, so it's the single source of that decision.
      const effectivePlatform = resolveEffectivePlatform(
        provider,
        model.id,
        settings.billingMode,
        keyConfigured,
      );
      // Pre-flight gate — FAIL CLOSED (pure + unit-tested in `send/preflight.ts`):
      // org suspension, org-blocked model, exhausted credits (org or personal), missing
      // key, unconfigured self-hosted endpoint. Any failure is shown INLINE as a failed
      // turn (with an optional CTA) — no wire leaves. Mirrors how the stream `onError`
      // path persists errors.
      const preflightFail = preflightError({
        orgProfile: orgProfileRef.current,
        personalCredits: personalCreditsRef.current,
        personalSub: personalSubRef.current,
        keyConfigured,
        hasBilling: !!host.billing,
        provider,
        model,
        effectivePlatform,
        openaiCompatBaseUrl: settings.openaiCompatBaseUrl,
        localEndpointReachable: localEndpointReachableRef.current,
        claudeCliReady: claudeCliReadyRef.current,
        codexCliReady: codexCliReadyRef.current,
        antigravityCliReady: antigravityCliReadyRef.current,
      });
      if (preflightFail) {
        failTurn(preflightFail.text, preflightFail.action);
        return;
      }

      // Platform-provided models (Scaleway, or OpenRouter WITHOUT a user key) are
      // proxied by the backend inference endpoint with the user's Supabase JWT —
      // resolve the base URL + a FRESH token once for this send (no provider key
      // involved). OpenRouter WITH a user key routes direct instead (effectivePlatform).
      const platform = effectivePlatform;
      let platformBaseUrl: string | undefined;
      let platformToken: string | undefined;
      if (platform) {
        platformBaseUrl = host.inferenceUrl;
        // HANG-GUARDED (send/tokenFetch.ts): a token refresh against an unreachable
        // auth server retry-storms behind supabase's auth lock — an un-capped await
        // here froze the send with no feedback at all, and queued every retry send.
        // It also forces ONE `reconnect()` when the session can't produce a token, so a
        // send RECOVERS by itself once the auth server is back (nothing else re-drives a
        // refresh on this path — see the comment there).
        const tok = await fetchPlatformToken(
          host.auth?.getAccessToken ? () => host.auth!.getAccessToken!() : undefined,
          { reconnect: host.auth?.reconnect ? () => host.auth!.reconnect!() : undefined },
        );
        platformToken = tok.ok ? tok.token : undefined;
        if (!platformBaseUrl || !tok.ok) {
          // WHICH failure this is decides the copy, and a wrong pick states a falsehood
          // (an outage told as « prenez un abonnement » to a paying user) — the whole
          // decision is pure + pinned in `send/platformTokenMessage.ts`.
          const fail = platformTokenFailure(tok, {
            freeModel: isFreeModel(model.id),
            personalSub: personalSubRef.current,
          });
          failTurn(fail.text, fail.action);
          return;
        }
      }

      // Reversible redaction: the model only ever sees scrubbed text, while we
      // keep the originals locally and restore them in the reply. A per-
      // conversation vault keeps mappings stable and reversible across turns.
      //
      // `redactEngine` can only ever be "local" or "patterns" here: `normalizeSettings`
      // coerces "remote"/"model" to "local" on every load (the selectors were
      // removed from the product — an old blob must not keep sending detection
      // outside the machine). The "remote"/"model" branches of this callback (~200 LOC
      // of unreachable code re-read on every change) are PURGED (audit 2026-08-10);
      // the live remote engine is the gateway endpoint, not this path.
      //
      // "local" engine: LLM-free, 100% offline free-form PII via GLiNER, run
      // in-process by the host (desktop main). No network, no completion call.
      // ⚠️ The HOST's capability decides, never the persisted preference: a stale "patterns"
      // (the selector is gone) would pin that user to the regex floor for good, unwarned and
      // with no UI to find. A host without a detector is unchanged.
      const useLocal = !!host.detectLocalPii;
      // An AI-grade free-form detector ran — gates the numbers toggle, the
      // fail-closed warning, and analytics.
      const useAiDetect = useLocal;
      // API keys are scrubbed in the main process (they're not in the renderer);
      // the regex rules also catch key-shaped strings. So no extra secrets here.
      const extraSecrets: string[] = [];
      const vault: Vault = { ...(conv.redactionVault ?? {}) };
      // Per-conversation secret salt for the value→fake mapping: minted ONCE (CSPRNG,
      // 31-bit non-zero) and reused for every send of this conversation, so the same real
      // value keeps its fake here but maps DIFFERENTLY elsewhere, so a table precomputed
      // over the public pool no longer reverses it. A shift, not a key: see `dispatch.ts`.
      // Absent on a pre-existing conversation ⇒ mint now; its already-vaulted values keep
      // their old (salt-0) fakes via the vault, only NEW values use the salt. Persisted
      // beside the vault (and stripped from the plaintext localStorage mirror, like it).
      // FAIL CLOSED on a missing CSPRNG (audit): the old `?? 1` fallback silently minted
      // the CONSTANT salt 1 — i.e. a public, dictionary-invertible mapping — on any
      // runtime without `crypto.getRandomValues`. Every supported runtime (Electron
      // renderer, Capacitor WebView, extension, browsers) has one, so this throw is
      // loud-and-dead code rather than a user-facing break; a platform that ever lacks
      // it must supply a real CSPRNG, not degrade to a public mapping. `failTurn` first —
      // the optimistic bubble is already on screen, and unwinding without resolving it
      // would leave the turn spinning forever; the throw then unwinds the rest of the
      // send (ChatView treats a thrown send as already-handled, no banner).
      const needsMint = conv.redactionSalt == null || conv.redactionKey == null;
      if (needsMint && typeof globalThis.crypto?.getRandomValues !== "function") {
        const reason = "générateur aléatoire indisponible (clé de redaction)";
        failTurn(new RedactionUnavailableError(reason).message);
        throw new RedactionUnavailableError(reason);
      }
      const redactionSalt =
        conv.redactionSalt ?? ((globalThis.crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff) || 1);
      // The KEY the generators draw from. Minted now for a conversation that predates it:
      // the vault holds the fakes already seen, so only NEW values take the keyed path.
      const redactionKey = conv.redactionKey ?? mintRedactionKey();
      // What the MODEL sees: a believable fake (default) or a `[PERSON1]`-style marker.
      // Like the salt, the mode is pinned on the CONVERSATION at the first redaction and the
      // global setting no longer decides afterwards: switching mid-way, the history replayed
      // to the model would mix both forms for the same people (reversible on both
      // sides, but unreadable for it). Persisted with the salt, in the same blob.
      const redactionMode: "fake" | "token" =
        conv.redactionMode ?? (settings.redactWireTokens ? "token" : "fake");
      // A file sent as redacted IMAGES isn't folded into the wire text, so its
      // fake→original pairs wouldn't otherwise reach the vault — merge them so the
      // model's reply is still un-redacted for those values (and they persist).
      if (opts?.fileVault) Object.assign(vault, opts.fileVault);

      // The redaction model can run on any non-session provider: an open-source
      // local model (openai-compat → Ollama), the Mistral API or any other
      // OpenAI-compatible endpoint (openai-compat + base URL/key), or a hosted
      // API (openai / anthropic / google). The key falls back to the one saved
      // for that provider; the base URL only applies to openai-compat.
      const redactProvider = settings.redactProvider;
      // Cap the redaction call: a slow/hung endpoint must never block the chat.
      // On timeout we reject so detection falls back to the regex rules.
      const REDACT_TIMEOUT_MS = 12000;
      const completeFn = host.complete
        ? async (messages: { role: "system" | "user" | "assistant"; content: string }[]) => {
            const t0 = performance.now();
            const redactModelId = resolveRedactModel(redactProvider, settings.redactModelName);
            try {
              const reply = await Promise.race([
                host.complete!({
                  provider: redactProvider,
                  model: redactModelId,
                  messages,
                  // Key injected in main: the "redactModel" key, else the provider's.
                  baseUrl:
                    redactProvider === "openai-compat"
                      ? settings.redactModelBaseUrl || settings.openaiCompatBaseUrl
                      : undefined,
                  temperature: 0,
                }),
                new Promise<string>((_, reject) =>
                  setTimeout(() => reject(new Error("redaction model timed out")), REDACT_TIMEOUT_MS),
                ),
              ]);
              const ms = performance.now() - t0;
              // Intermediate step timing (DEVELOPER debug log → Outils tab).
              dbg({
                type: "tool",
                name: "redaction · détection IA",
                ok: true,
                args: `${redactProvider} · ${redactModelId} · ${messages[messages.length - 1]?.content.length ?? 0} car.`,
                result: `${Math.round(ms)} ms`,
              });
              captureEvent({ name: "redaction_timing", engine: "model", model: redactModelId, ms, ok: true, chars: messages[messages.length - 1]?.content.length ?? 0 });
              return reply;
            } catch (e) {
              dbg({
                type: "tool",
                name: "redaction · détection IA",
                ok: false,
                args: `${redactProvider} · ${redactModelId}`,
                result: `${Math.round(performance.now() - t0)} ms`,
                error: e instanceof Error ? e.message : String(e),
              });
              // The FAILURE contributes to the distribution (the timeout is the worst
              // latency case, and it was never counted — audit 13/08). Bounded cause.
              captureEvent({ name: "redaction_timing", engine: "model", model: redactModelId, ms: performance.now() - t0, ok: false, reason: redactionFailReason(e) });
              throw e;
            }
          }
        : undefined;
      // Offline local NER (BERT): produces the SAME verbatim `Detection[]` as the
      // LLM detector, but in-process via the host — no completion, no network.
      // `pseudonymize` merges it with the regex rules exactly like `complete`. The
      // FIRST call also loads the model, so its timing includes the one-time warm.
      const detectLocalFn = host.detectLocalPii
        ? async (t: string) => {
            const t0 = performance.now();
            try {
              const found = await host.detectLocalPii!({ text: t });
              const ms = performance.now() - t0;
              const cold = !isNerWarmed();
              markNerWarmed();
              dbg({
                type: "tool",
                name: "redaction · NER local",
                ok: true,
                args: `${t.length} car.${cold ? " · cold" : ""}`,
                result: `${found.length} entités · ${Math.round(ms)} ms`,
              });
              // Anonymised perf telemetry: bucketed latency, no content. `model` is a
              // fixed engine label (the model is platform-fixed, no longer selectable).
              captureEvent({ name: "redaction_timing", engine: "local", model: "bert-ner", ms, cold, ok: true, chars: t.length });
              return found;
            } catch (e) {
              dbg({
                type: "tool",
                name: "redaction · NER local",
                ok: false,
                args: `${t.length} car.`,
                result: `${Math.round(performance.now() - t0)} ms`,
                error: e instanceof Error ? e.message : String(e),
              });
              captureEvent({ name: "redaction_timing", engine: "local", model: "bert-ner", ms: performance.now() - t0, ok: false, reason: redactionFailReason(e), chars: t.length });
              throw e;
            }
          }
        : undefined;

      // History/system: deterministic forward substitution (model engine) or the
      // pattern scrubber (patterns engine). Either way the same vault keeps every
      // secret mapped to a stable token.
      // Effective categories = global defaults overridden by this conversation's
      // sparse override; the off ones are left in clear (not redacted/highlighted).
      // The organization's mandated categories are layered LAST (highest priority),
      // forced ON — a member cannot disable a category the org requires.
      const effectiveCategories = effectiveRedactCategories(
        settings.redactCategories,
        conv.redactCategories,
        orgProfileRef.current?.forcedCategories,
      );
      const disabledKinds = disabledKindsOf(effectiveCategories);
      // Notoriety dispensation, derived from THIS conversation's effective LEVEL (same
      // categories as above): every level except Strict leaves big brands
      // (MCP integrations included) AND famous people in clear; Strict redacted
      // both (`privacy/privacyLevel.ts` is the policy). Frozen at send entry,
      // like `disabledKinds` — it also governs tool results.
      const { commercial: commercialNotoriety, people: peopleNotoriety } = notorietyForLevel(
        levelOf(effectiveCategories, orgProfileRef.current?.forcedCategories),
      );

      // value -> kind learned across this conversation, so disabled categories
      // (and numbers) stop being substituted even for values already in the
      // vault — fake-data tokens carry no category of their own.
      const convKinds = convKindsFromSpans(conv);
      // Categories discovered by a pass OTHER than the user message — the injected MÉMOIRE
      // block and the document DETECTION layers. Those passes mutate the shared vault, so
      // their values are reversible; but conversation kinds are derived from a MESSAGE's
      // `redactedSpans`, and a memory/layer value belongs to no message. It therefore had
      // no category anywhere and every consumer fell back to « sensitive » — the reported
      // bug: a person named only in the mémoire was filed as generic INFO, not as a person
      // (and painted with the fallback hue). Collected here, folded into `turnKinds` and
      // persisted into `redactionKinds` below, exactly like the user pass's spans.
      const extraKinds: Record<string, string> = {};
      const recordKinds = (matches: RedactionMatch[] | undefined): void => {
        for (const sp of deriveRedactedSpans(matches ?? [])) extraKinds[sp.value] = sp.kind;
      };

      // Conversation-aware fake-collision avoidance: the REAL words already present in
      // the conversation (prior message contents). A newly-minted fake must not reuse
      // one — else a fake place ("france") collides with a word the user actually typed
      // elsewhere, which the vault then re-redacted / reverse-corrupts. Bounded so the
      // per-send tokenisation stays cheap; the current message + every vault ORIGINAL
      // are handled inside `pseudonymize` itself. `pseudonymize`/`remoteRedact` take
      // `avoid` as text blobs and extract the words.
      const avoidList = avoidBlob(conv);

      // Vault entries to NOT re-apply because their category is turned off.
      const wireExclude = disabledVaultTokens(vault, {
        numbers: redactNumbersOn(settings),
        disabledKinds,
        kinds: convKinds,
      });

      // System prompt + prior turns: replay the conversation vault (the fakes
      // already chosen for those values), same for both engines.
      const toWire = (s: string) => ({
        text: applyVault(s, vault, wireExclude),
        matches: [] as unknown[],
      });
      // When numbers are tokenised, the downstream model answers with formulas
      // in the n-tokens (see NUMBER_TOKEN_INSTRUCTION); compute them back to real
      // figures before restoring the remaining tokens, so the user sees the
      // actual numeric result instead of an opaque expression. LAZY on purpose:
      // SALARY amounts mint n-tokens INDEPENDENTLY of `redactNumbers` (they must
      // stay calculable, never faked), and the first one can be minted by THIS
      // send's redaction — a boolean snapshot taken here would miss it.
      const numberMode = (): boolean =>
        (useAiDetect && redactNumbersOn(settings)) ||
        Object.keys(vault).some((k) => /^n\d+$/.test(k));
      // Restore the originals in the user's copy — the other half of the reversible
      // round-trip, unconditional (the vault is the product). `unredactReply` also repairs
      // a fake MUTATED by the model — DISPLAY only, never the args.
      const fromWire = (s: string) =>
        numberMode() ? unredactReply(computeTokenFormulas(s, vault), vault) : unredactReply(s, vault);
      // URL/args-aware un-redactor for the write-confirmation DISPLAY: a fake in a URL
      // query is `+`/`%20`-encoded, which plain `unredact` leaves as the FAKE (the card
      // then under-stated what leaves). `unredactArgs` restores the encoded forms too —
      // exactly what the RedactingMcpClient sends. Same number gating as `fromWire`.
      const fromWireArgs = (s: string) =>
        numberMode()
          ? unredactArgs(computeTokenFormulas(s, vault), vault)
          : unredactArgs(s, vault);

      // Fold the attached files' (still original) text into the MODEL payload ONLY —
      // never the displayed message. The pure, unit-tested `buildFoldedPayload`
      // (send/foldPayload.ts) masks the real filename, partitions text-fold vs redacted-
      // image docs, reuses drop-time redaction, and seeds the reused docs' fake→real into
      // `vaultPreload`. The folded text is redacted by this conversation's vault below like
      // any other text (the model sees a redacted version; the user sees a file chip).
      const { modelText, fullModelText, hasFolded, reuseParts, vaultPreload } = buildFoldedPayload(
        text,
        attachments,
        opts ?? {},
        modelPrefix,
      );
      // Pre-load the reused replacements into the vault (fake→real) so `applyVault` below
      // AND the typed-text detector share the SAME fakes for a value seen in both.
      Object.assign(vault, vaultPreload);

      // Model engine: a local model (Ollama / Mistral) finds free-form PII —
      // names, phones, addresses… — and we swap each for *believable fake data*
      // of the same kind; every standalone number becomes a n1/n2/… token. All
      // mappings land in the vault, so the reply is restored by unredact() and
      // history is re-applied deterministically (applyVault, no extra model
      // calls). Best-effort: a missing/failing model degrades to regex + numbers.
      // For the patterns engine this is the original synchronous scrub.
      // Both engines pseudonymise: every match is swapped for believable FAKE
      // data of the same kind (fake name/email/phone/company…), never a
      // conspicuous [REDACTED_…] placeholder. The model engine additionally runs
      // the model detector for free-form PII (names, orgs) and tokenises numbers.
      const forcedList = sendForcedList(combinedVaultTerms(settings), conv, opts?.forcedRedactions, modelText);
      const keepList = sendKeepList(keepListRef.current, conv, opts?.keepValues, forcedList);
      const engineCtx = buildSendEngineContext({
        disabledKinds, keep: keepList, connected: keepListRef.current,
        unrevealableCategories: orgProfileRef.current?.forcedCategories,
        avoid: avoidList, kinds: convKinds, salt: redactionSalt, key: redactionKey,
        mode: redactionMode, commercialNotoriety, peopleNotoriety,
      });
      // MÉMOIRE — cross-conversation durable facts. Runs BEFORE the user-message pass
      // ON PURPOSE: its `forced` entities land in the vault first, so the typed text's
      // own mention of a remembered entity is replayed to the SAME fake even under the
      // regex engine (which cannot detect a free-form name by itself). Selected CLIENT-SIDE on REAL values
      // (the model only holds fakes, unstable across conversations since the salt, so it
      // CANNOT do this), then re-redacted through THIS conversation's engine+vault+salt
      // before joining the system content. The selected entities ride `forced`, so the
      // injection is protected even under the regex engine (a card's entity is KNOWN PII
      // — no detector needed). Fail-closed = SKIP the injection (nothing egresses);
      // memory is an enhancement, never worth a leak.
      let memoryWire = "";
      // "Sans mémoire dans cette conversation": the selection isn't even computed
      // — nothing goes in, and no legend (used/skipped) is shown here.
      const memSel = conv.memoryOff
        ? { profile: undefined, cards: [], block: "", skipped: [] }
        : selectMemory({
            text,
            convValues: [...Object.values(vault), ...Object.keys(convKinds)],
            memory: settings.memoire,
          });
      // The memory forced-list, MINUS what the level's notoriety spares: a forced
      // "google" alias used to mint a fake that the vault reapplied to the whole prompt
      // ("Ostrel Drive") — see filterNotoriousFromForced. In Strict, nothing gets out.
      const memForced = filterNotoriousFromForced(memoryForcedForBlock(memSel, settings.memoire), {
        commercial: commercialNotoriety,
        people: peopleNotoriety,
      });
      if (memSel.block) {
        try {
          // ⚠️ The LOCAL engine (the only one shipped: `storePersistence` forces remote|model
          // → local, and the remote branches of this callback are purged) does NOT
          // abort in flight — the race against Stop + timeout is what makes the
          // bubble stoppable here (the "dead Stop button" fix, see
          // `raceRedactionWork`). Same for the two local passes that follow.
          const mres = await raceRedactionWork(
            pseudonymize(memSel.block, {
              vault,
              forced: memForced,
              reFakeExisting: true,
              numbers: false,
              detectLocal: useLocal ? detectLocalFn : undefined,
              ...engineCtx,
            }),
            { signal: sendAbort.signal, timeoutMs: redactTimeoutMs(memSel.block) },
          );
          if (!(useAiDetect && mres.modelError)) {
            memoryWire = mres.text;
            recordKinds(mres.matches as RedactionMatch[]);
          }
          if (memoryWire) {
            dbg({
              type: "tool",
              name: "mémoire · injection",
              ok: true,
              args: `${memSel.cards.length} fiche(s)${memSel.profile ? " + profil" : ""}`,
              result: `${memoryWire.length} car. (redacted)`,
            });
          }
        } catch (e) {
          memoryWire = ""; // skip on any failure — never inject un-redacted
          // …but the failure IS SAID: the log used to show the memory pass only when
          // it succeeded — "pourquoi tu ne te souviens pas de X ?" produced a
          // log where the step doesn't exist (audit 13/08). Fail-closed unchanged.
          dbg({
            type: "tool",
            name: "mémoire · injection",
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      if (stoppedEarly()) return; // Stop clicked during the memory pass

      let userWire: { text: string; matches: unknown[]; modelError?: string };
      // FAIL-CLOSED: if the "remote" engine was requested but the model pass did
      // NOT run (no URL/token, endpoint unreachable, or the server model pass
      // failed), ABORT the send — never silently fall back to regex, which would
      // leak the free-form PII (names, orgs…) the model was supposed to catch.
      // Drops the optimistic bubbles + throws a retryable blocking error.
      const failClosed = (reason: string): never => {
        console.warn(`[${BRAND.slug}] cloud redaction unavailable → send BLOCKED (fail-closed):`, reason);
        // Surface it in the in-app Debug Log (Settings → Développeur) so the
        // Scaleway redact-fn is monitorable without DevTools — the raw reason
        // (HTTP status / timeout / modelError) shows in the "Erreurs" tab.
        dbg({ type: "error", scope: "cloud-redaction", message: reason });
        // Separate error-tracking channel (anonymised): a blocked send is a
        // user-facing failure worth catching early, not a product event.
        captureError({ scope: "redaction", code: "fail-closed", message: reason });
        // THIS send's early cancellation no longer has a purpose (the turn is resolved).
        cancelRef.current.delete(convId!);
        // Persist the block INLINE on the assistant bubble (keeps the user's
        // message, survives reload, offers Réessayer) instead of dropping the turn
        // + a transient banner. The throw below only unwinds the rest of the send;
        // ChatView treats a thrown send as already-handled (no banner).
        patchConversation(convId!, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === assistantMsg.id
              ? {
                  ...m,
                  pending: false,
                  error: true,
                  errorText: new RedactionUnavailableError(reason).message,
                }
              : m,
          ),
          updatedAt: Date.now(),
        }));
        setIsStreaming(false);
        throw new RedactionUnavailableError(reason);
      };

      // FAIL-CLOSED (audit M2 + same-class L): the user selected an AI redaction engine,
      // but its detector isn't actually available on THIS host — `local` with no
      // `host.detectLocalPii`, or `model` with no `host.complete`. Without this guard
      // `useLocal` silently resolves to false / `completeFn` to undefined, so `pseudonymize`
      // runs REGEX-ONLY, `useAiDetect` is false, and the `useAiDetect && modelError` check
      // below never fires — a SILENT downgrade of the AI guarantee to regex (exactly what
      // hard rule 7 forbids). Block the send instead of leaking the free-form PII (names,
      // orgs…) the chosen engine was supposed to catch.
      const missingEngine = redactEngineUnavailable(settings.redactEngine, host);
      if (missingEngine === "local") {
        return failClosed("moteur « IA locale » indisponible sur cet appareil");
      }
      if (missingEngine === "model") {
        return failClosed("moteur de détection « modèle » indisponible (aucun fournisseur configuré)");
      }

      // Connected-integration names (Stripe, Canva…) the chat model needs
      // verbatim — allow-listed so redaction never redacted a tool/connector
      // name (which would make the model fail to recognise its own tools).
      // `keep` = connected-integration names + the values the user un-redacted for
      // THIS conversation (suspendre/supprimer) + the per-message values the user
      // deselected in the composer chips (`opts.keepValues`) → they're never redacted
      // this send (case-insensitive), so a false-positive like "redonne" stays clear.
      // keepListRef = cached connected-integration names (refreshed on connect/disconnect,
      // NOT re-queried per send — that used to round-trip every MCP server and stall).
      // User-FORCED manual redactions: the global COFFRE (values always redacted, every
      // conversation + model) + the conversation's persisted set + any passed for THIS
      // send (the pre-conversation first message). Deduped by value; only values present
      // in the outgoing text matter. An EXPLICIT reveal still wins over these.
      // ⚠️ Computed BEFORE `keepList` on purpose — the keep list needs it to drop an
      // automatic connector name that collides with a Coffre term (see `sendKeepList`).

      // ATTACHMENTS' EXTRA LAYERS (fail-closed) — the OCR reading (what the PIXELS say)
      // and the geometry-built HYBRID reading are DETECTED into the SAME vault BEFORE the
      // message pass: a value visible only in the page image is vaulted, and a value the
      // primary text holds but hides from its detector (broken reading order) is then
      // replaced in the wire by the message pass's vault replay. Detection-only — this
      // block is NEVER sent to a model. A failure here loses that guarantee, so it blocks
      // the send exactly like the message pass (same M2/M10 rationale: no silent downgrade).
      const layersBlock = attachmentDetectBlock(attachments);
      if (layersBlock) {
        try {
          const lres = await raceRedactionWork(
            pseudonymize(layersBlock, {
              vault,
              reFakeExisting: true,
              numbers: false,
              detectLocal: useLocal ? detectLocalFn : undefined,
              ...engineCtx,
            }),
            { signal: sendAbort.signal, timeoutMs: redactTimeoutMs(layersBlock) },
          );
          if (useAiDetect && lres.modelError) {
            return failClosed(`détection des couches document échouée (${lres.modelError})`);
          }
          recordKinds(lres.matches as RedactionMatch[]);
          dbg({
            type: "tool",
            name: "redaction · couches document",
            ok: true,
            args: `${(attachments ?? []).length} pièce(s)`,
            result: `${layersBlock.length} car. détectés (OCR/hybride)`,
          });
        } catch (e) {
          // A Stop during the pass aborts the fetch → the AbortError arrives HERE:
          // it's the user, not an outage — resolve as "interrupted", never
          // as a fail-closed error.
          if (stoppedEarly()) return;
          return failClosed(e instanceof Error ? e.message : String(e));
        }
      }
      if (stoppedEarly()) return; // Stop clicked during the document layers

      try {
        userWire = await raceRedactionWork(
          pseudonymize(modelText, {
            vault,
            secrets: extraSecrets,
            forced: forcedList,
            // This is the user's OWN authored message: a detected value equal to an existing
            // fake is their REAL value (not our echo), so mint it a distinct fake instead of
            // dropping it (which would leak it in clear + reverse-corrupt the other value).
            reFakeExisting: true,
            numbers: useAiDetect ? redactNumbersOn(settings) : false,
            detectLocal: useLocal ? detectLocalFn : undefined,
            ...engineCtx,
          }),
          { signal: sendAbort.signal, timeoutMs: redactTimeoutMs(modelText) },
        );
      } catch (e) {
        if (stoppedEarly()) return; // Stop during local detection — not an outage
        return failClosed(e instanceof Error ? e.message : String(e));
      }
      // FAIL CLOSED (audit M-10): the user chose an AI redaction engine for the
      // guarantee, but `pseudonymize` CATCHES a detector throw (NER weights failed to
      // load) and degrades to regex — sending names/orgs the AI would have caught,
      // with only a warning. Block the send when the required AI detector failed.
      if (useAiDetect && userWire.modelError) {
        return failClosed(`détection locale échouée (${userWire.modelError})`);
      }

      // Append the REUSED documents' wire — applied DETERMINISTICALLY from their drop-time
      // fakes (already in the vault), never re-detected. Pure + unit-tested
      // (send/reusedDocsWire.ts): each rep is added as a preview/audit `match` and its
      // real value is redacted to its fake in the appended text.
      userWire = appendReusedDocsWire(userWire, reuseParts, vault, wireExclude);
      if (stoppedEarly()) return; // Stop clicked during the message's redaction

      // PRE-SEND PREVIEW: let the user review the EXACT redacted wire and un-redact
      // spans before anything leaves the machine. Gated on the review hook (ChatView)
      // and there being ≥1 redacted span — there is no setting.
      // Un-redaction is instant (unredact of the chosen tokens) — no model re-call.
      const previewMatches = userWire.matches as RedactionMatch[];
      if (opts?.reviewWire && previewMatches.length > 0) {
        const decision = await opts.reviewWire({ wire: userWire.text, vault, matches: previewMatches });
        if (!decision) {
          // Cancelled: drop the optimistic bubbles + abort cleanly (no error banner).
          patchConversation(convId, (c) => ({
            ...c,
            messages: c.messages.filter((m) => m.id !== userMsg.id && m.id !== assistantMsg.id),
          }));
          setIsStreaming(false);
          return;
        }
        if (decision.restoreTokens.length) {
          const restored = new Set(decision.restoreTokens);
          userWire = {
            ...userWire,
            text: applyRestore(userWire.text, vault, decision.restoreTokens),
            matches: previewMatches.filter((m) => !restored.has(m.placeholder)),
          };
        }
      }

      // The log's `wire` entry ALWAYS goes out (permanent collection — a "Votre
      // avis" report must be able to embed it with no prior setting); only the
      // colourised console trace stays behind "Journal technique détaillé". The id
      // is used to patch the token cost in once the model replies.
      const wireDebugId = logWireMessage(
        { model: model.id, text: userWire.text, vault, kinds: convKinds, convId },
        { toConsole: !!settings.debugLog },
      );

      // The spans we redacted in this message (pure + tested, send/sendAnalytics.ts):
      // the FINE category (not the coarse colour kind) so per-category toggles govern
      // re-applying these values across later turns; highlight tones still resolve from it.
      const redactedSpans = deriveRedactedSpans(userWire.matches as RedactionMatch[]);
      // value -> kind for THIS turn as well as the prior ones. `convKinds` was built from
      // the conversation SNAPSHOT taken before this message existed, so on the first
      // message it is EMPTY — and the agent loop's `kinds` would then carry no category
      // for the very values this send just vaulted, leaving them unlabelled in the Debug
      // Log's mapping. Merge the spans in as soon as they exist. Pinned by
      // `send/turnKinds.test.ts`.
      const turnKinds: Record<string, string> = { ...convKinds, ...extraKinds };
      for (const sp of redactedSpans) turnKinds[sp.value] = sp.kind;
      // The AI detector was asked to run but failed → free-form PII (names,
      // addresses…) may be unmasked. Flag it on the message so the UI warns.
      const redactionFailed =
        useAiDetect && userWire.modelError
          ? describeRedactFailure(userWire.modelError, settings.redactEngine)
          : undefined;

      // Analytics (privacy-safe: counts/enums/category KEYS only, never values —
      // pure + tested in send/sendAnalytics.ts). One send + the redaction outcome.
      for (const e of buildSendAnalyticsEvents({
        provider: model.provider,
        model: model.id,
        textLength: text.length,
        matchCount: userWire.matches.length,
        useAiDetect,
        useRemote: false, // remote engine purged from the send (normalizeSettings forces local)
        modelError: !!userWire.modelError,
        spanKinds: redactedSpans.map((s) => s.kind),
      })) {
        captureEvent(e);
      }

      // Patch the already-visible user bubble with the redaction highlights, and
      // persist the (now-mutated) vault so history stays reversible across turns.
      patchConversation(convId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === userMsg.id
            ? {
                ...m,
                redactions: userWire.matches.length,
                redactedSpans: redactedSpans.length ? redactedSpans : undefined,
                redactionFailed,
                // MÉMOIRE actually injected into this send (redacted) — opaque card
                // ids + the "profile" sentinel, resolved at render. Only when the
                // injection SUCCEEDED (a fail-closed skip must not claim it happened).
                memoryUsed: memoryWire
                  ? [...(memSel.profile ? ["profile"] : []), ...memSel.cards.map((mc) => mc.id)]
                  : undefined,
                // The recall's near-misses (budget saturated, homograph ignored) — a
                // SURPRISING non-recall becomes diagnosable; ids + reason code
                // only, never content (the same regime as memoryUsed).
                memorySkipped: memSel.skipped.length ? memSel.skipped : undefined,
                // Keep the model payload on the message so later turns re-send the
                // document / plot directive / compétence prompt (rebuilt via the vault).
                // Display still uses `content`. Needed for folded files, the "Graphique"
                // directive and a compétence — each rides the payload, not the bubble.
                modelContent:
                  hasFolded || forcePython || !!compPrompt || !!atPrompt
                    ? fullModelText
                    : undefined,
                // Show the "Graphique" tag chip on the sent bubble (mirrors the composer).
                plotTag: forcePython ? "graphique" : undefined,
                // The compétence tag on the sent bubble. `prompt` is the SNAPSHOT that
                // actually went out — the compétence may be edited/deleted later.
                // `servers` (connector ids) is kept so the tag shows the
                // connectors the instruction named, AND so the FOLLOWING turn's tool
                // scope can pick it back up (`activeCompetenceScope`).
                // ⚠️ `message.workflow` is NEVER written: it is the old shape, read
                // only (`@openmasq/schema`).
                competence: opts?.competence
                  ? {
                      id: opts.competence.id,
                      name: opts.competence.name,
                      prompt: compPrompt,
                      servers: opts.competence.servers?.length ? opts.competence.servers : undefined,
                    }
                  : undefined,
                // The « Demander » target tag — same snapshot rule (`prompt` is what
                // actually went out); `kind`/`name`/`path`/`source` ARE the tag.
                askTarget: opts?.askTarget
                  ? { ...opts.askTarget, prompt: atPrompt }
                  : undefined,
              }
            : m,
        ),
        redactionVault: vault,
        redactionSalt,
        redactionKey,
        redactionMode,
        // Persist each redacted value's FINE category into the conversation-level
        // map too — not just onto the message. The Audit tab + privacy breakdown
        // read `redactionKinds`, so without this a user-TYPED name/company had no
        // kind and fell back to "secret" ("Clés & secrets"). Mirrors the tool-result
        // + file paths, which already record kinds.
        redactionKinds: {
          ...c.redactionKinds,
          // The mémoire / document-layer passes first (see `extraKinds`), then this
          // message's own spans — a value the user actually TYPED wins the category.
          ...extraKinds,
          ...Object.fromEntries(redactedSpans.map((s) => [s.value, s.kind])),
        },
        updatedAt: Date.now(),
      }));

      // Hidden mode: store each attached file locally (original + redacted) in
      // the SAME `files` table the visible-mode injector writes to. The main
      // process reads the path, redacts in place with this conversation's vault,
      // and returns the merged vault + spans (for the redaction log). Fire-and-
      // forget so a file write never delays the send.
      if (host.files?.redactAndSave && attachments?.length) {
        const fileConvId = conv.sessionConversationId || convId!;
        for (const a of attachments) {
          // A re-attach carries in-memory `data` (the on-disk blob is encrypted +
          // gate-denied); a native pick carries a granted `path`. Need one of them.
          if (!a.path && !a.data) continue;
          void host.files
            .redactAndSave({
              id: uid(),
              conversationId: fileConvId,
              path: a.path,
              data: a.data,
              name: a.name,
              mime: a.mime || "application/octet-stream",
              vault,
              disabledKinds,
              // The drop-time count so an image/PDF (bytes can't be scrubbed in place →
              // the storage pass counts 0) still shows its redaction badge in the library.
              redactedCount: a.redactPreview,
              // Persist the extraction (text + OCR layers) so RE-ATTACHING this file skips
              // re-running OCR/parsing — the new conversation's send re-redacted the text.
              // `redactions` = the DROP-TIME map, frozen: it is what the Library
              // viewer repaints (the conversation vault was over-marking, see host).
              extraction:
                a.text || a.replacements?.length
                  ? {
                      text: a.text ?? "",
                      ocrText: a.ocrText,
                      words: a.words,
                      ocrPages: a.ocrPages,
                      ocr: a.ocr,
                      redactions: a.replacements?.map(({ real, fake, tone, kind }) => ({ real, fake, tone, kind })),
                    }
                  : undefined,
            })
            .then(({ vault: merged, kinds, spans, redacted }) => {
              // Privacy-safe: mime + a coarse size bucket + redaction count only —
              // never the file name or content.
              captureEvent({
                name: "file_attached",
                mime: a.mime || "application/octet-stream",
                // ⚠️ The FILE size when it is known (bytes ≈ base64 × ¾), not the
                // extracted text's length: an image/scan with no text used to read "0"
                // under a field named sizeBucket (audit 13/08).
                sizeBucket: bucket(a.data ? Math.round(a.data.length * 0.75) : (a.text?.length ?? 0)),
                redactions: spans.length,
              });
              patchConversation(convId!, (c) => ({
                ...c,
                redactionVault: merged,
                redactionKinds: { ...c.redactionKinds, ...kinds },
                fileRedactions: spans.length
                  ? [...(c.fileRedactions ?? []), { name: a.name, spans, at: Date.now() }]
                  : c.fileRedactions,
              }));
              // Monitor document redaction in the Debug Log (Outils tab).
              dbg({
                type: "tool",
                name: "document-redaction",
                ok: true,
                args: a.name,
                // ⚠️ Do NOT write "0 spans redacted" for a PDF/image: the in-place
                // pass throws by design on these formats, `spans` is empty, and the
                // line was therefore stating the opposite of the truth on the one surface
                // the user checks to verify redaction happened. The
                // text itself IS redacted — that's what the line above shows.
                result:
                  redacted === false
                    ? `format non réinscriptible — octets d'origine conservés (chiffrés) ; le texte envoyé est redacted`
                    : `${spans.length} valeurs masquées dans les octets stockés`,
              });
            })
            // Was fire-and-forget with a swallowed error — surface it now so a
            // failed document redaction is visible (Erreurs tab) instead of silent.
            .catch((e) =>
              dbg({
                type: "error",
                scope: "document-redaction",
                message: `${a.name}: ${e instanceof Error ? e.message : String(e)}`,
              }),
            );
        }
      }

      // Audit: the CUSTOM system prompt is only vault-REPLAYED by `toWire` in
      // `buildSystemContent`, never run through the DETECTOR — so NOVEL PII the user wrote in
      // Réglages (a name/address) egressed in CLEAR on the first turn. Redact it into the SAME
      // conversation vault with the settings-bound engine, FAIL-CLOSED like the message; `toWire`
      // below then replays those fakes. Gated on a non-default custom prompt, so the default
      // "You are a helpful assistant." pays nothing. (Engine availability was already enforced
      // for the message above, so we inherit it here. Follow-up: cache so a REMOTE engine
      // doesn't re-detect a static prompt every send.)
      if (shouldRedactSystemPrompt(settings.systemPrompt, DEFAULT_SETTINGS.systemPrompt)) {
        try {
          // `makeRedactFn` knows how to cancel itself — this was the ONLY caller that
          // denied it the signal (the dead-Stop bug, one phase further in the same function).
          const sys = await makeRedactFn(host, settings, orgProfileRef.current?.forcedCategories)(
            settings.systemPrompt,
            sendAbort.signal,
            vault,
            conv.redactCategories,
          );
          if (sys.modelError) return failClosed(`détection du prompt système échouée (${sys.modelError})`);
        } catch (e) {
          if (stoppedEarly()) return;
          return failClosed(e instanceof Error ? e.message : String(e));
        }
      }
      // Last boundary before the DISPATCH (stream or tool loop) — past this, the
      // paths set their OWN cancellation into `cancelRef` (phase handoff).
      if (stoppedEarly()) return;

      // Today's date + recency nudge (so the model stops treating the present as
      // the future and browses for current-events queries), the system prompt
      // (scrubbed) and the n-token formula instruction. The date is NOT run through
      // `toWire` — it's not PII — and rides into BOTH the plain stream AND the
      // agentic loop (which extends this same leading system message).
      const systemContent =
        // `skills`: Compétences usage off ⇒ we stop ASKING the model to
        // suggest any. The memory below injects whether that door is closed or not — a different switch.
        buildSystemContent(toWire, settings.systemPrompt, numberMode(), {
          skills: featureUsage("competences"),
        }) + (memoryWire ? `\n\n${memoryWire}` : "");
      // Build the redacted payload from the stored (original) history — redaction lives in
      // `toWire`; `buildWireHistory` only structures it (pure + unit-tested).
      const builtHistory = buildWireHistory(
        conv.messages,
        userWire,
        systemContent,
        opts?.imageAttachments,
        toWire,
      );

      // Slide a context window over a long thread so it never blows the model's window
      // (the provider used to 400 "context length exceeded" with no degradation): keep
      // the system message + the most-recent turns that fit, drop the oldest, fold in an
      // omission marker. Reserve headroom for the reply + (agentic) tool schemas the loop
      // appends AFTER this — more when connectors are active (the tool router keeps them
      // ≤35% of the window). Unknown window ⇒ no trim (unchanged behaviour).
      const usesTools = !!(host.mcp && host.completeTools) && supportsTools(model.id);
      const ctxTokens = contextWindow(model.id);
      const { messages: history, dropped: droppedTurns } = fitHistoryToContext(builtHistory, {
        contextTokens: ctxTokens,
        reserveTokens: ctxTokens ? Math.round(ctxTokens * (usesTools ? 0.45 : 0.2)) : 0,
        summary: conv.contextSummary,
      });
      if (droppedTurns > 0) {
        dbg({
          type: "phase",
          scope: "system",
          label: "contexte tronqué",
          detail: `${droppedTurns} message(s) ancien(s) omis (fenêtre ${ctxTokens} tokens)`,
        });
      }

      const updateAssistant = (patch: Partial<Message>) =>
        patchConversation(convId!, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === assistantMsg.id ? { ...m, ...patch } : m,
          ),
          updatedAt: Date.now(),
        }));

      setIsStreaming(true);

      // Agentic MCP path: if connected connector tools exist, let the model call
      // them. Every tool argument is un-redacted just before the real server and
      // every result re-redacted into the vault, so the model still only sees
      // placeholders. Falls through to normal streaming when no tools are present —
      // or when the MODEL can't do function calling (`supportsTools`: OpenRouter's
      // Gemma tiers 400 UPSTREAM_ERROR on any `tools` request; a plain stream is the
      // graceful degrade, connectors simply unavailable on that model).
      if (host.mcp && host.completeTools && !usesTools) {
        dbg({
          type: "phase",
          scope: "loop",
          label: "outils indisponibles",
          detail: `${model.id} ne supporte pas l'appel d'outils — envoi simple sans connecteurs`,
        });
      }
      if (usesTools && host.mcp && host.completeTools) {
        // Redact tool RESULTS with the SAME engine as the chat, ALWAYS producing
        // reversible FAKES — never the visible [REDACTED_…] marker, which the
        // model normalises to a bare "[REDACTED]" that unredact() can't reverse
        // (that's why tool-result IDs/emails rendered literally as [REDACTED]).
        // remote → server pseudonymize; model → local model; patterns → regex.
        // Per-value categories learned while redacting TOOL RESULTS / documents.
        // Persisted into the conversation's redactionKinds after the loop so those
        // values get their PER-TYPE colour (else they fell to the "sensitive"/coral
        // fallback → everything rendered red in the redaction log).
        const toolKinds: Record<string, string> = {};
        const redactToolResult = makeRedactToolResult({
          // Remote/model engine purged from the send (normalizeSettings forces local) — the
          // corresponding branches of toolResult.ts remain for the gateway/evals.
          useRemote: false,
          useAiDetect,
          useModel: false,
          useLocal,
          settings,
          host,
          extraSecrets,
          // The Coffre + the conversation's forced set, UNFILTERED (audit): the
          // user-message `forcedList` keeps only values present in `modelText`, so a
          // Coffre value the user never typed that surfaces in a Gmail/CRM RESULT was
          // reaching the model in CLEAR — while the Coffre page promised "toujours
          // redacted". Pinned by `send/toolResult.test.ts` (coffre-in-tool-result).
          forced: toolForcedList(combinedVaultTerms(settings), conv),
          // `memory_search`'s result carries the cards' entities (known PII) —
          // protected by FORCED, never by detection alone (see toolResult.ts).
          memorySearchForced: filterNotoriousFromForced(memoryForcedAll(settings.memoire), { commercial: commercialNotoriety, people: peopleNotoriety }),
          // The SAME engine context as the message — with one explicit divergence:
          // ⚠️ `turnKinds`, not `convKinds`: the tool-result redactor needs the value→kind
          // map to include THIS send's freshly-vaulted spans, or on a conversation's FIRST
          // message it cannot tell that a vaulted value is (say) a company — so neither a
          // per-category disable, the BROWSER/SEARCH clear policy, nor a mid-send reveal
          // can stop the vault replaying its fake into a tool result. Pinned by
          // `evals/navigation.test.ts` ("applies to the CURRENT send's tool results").
          engine: { ...engineCtx, kinds: turnKinds },
          // The "already in clear" harvest reads THIS wire's USER turns (so
          // post-redaction) — never a tool/assistant text (`toolResultKeep.ts`).
          wireUserTexts: history.filter((m) => m.role === "user").map((m) => m.content),
          completeFn,
          detectLocalFn,
          toolKinds,
          convId,
        });

        // Wire Stop into the agentic turn: abort the renderer-side loop AND ask
        // main to cancel the in-flight provider fetch (the turn isn't streamed).
        const toolRequestId = uid();
        const toolController = new AbortController();
        // Did the provider REPORT this agentic turn's usage? On a turn that
        // fails BEFORE the report, the bubble gets an ESTIMATE ("zero is the one
        // answer that is certainly wrong", send/estimateUsage.ts) — the plain path
        // already did this, the agent path recorded zero (audit 2026-08-10).
        let agentUsageReported = false;
        cancelRef.current.set(convId!, () => {
          toolController.abort();
          host.cancelTools?.(toolRequestId);
        });
        finishRef.current.delete(convId!); // the loop finalizes itself on abort
        // Latency clock for the agentic (tools) dispatch — reset just before the loop.
        mT0 = Date.now();
        mTFirst = 0;
        // Outside the try so the catch can end it too (a failed turn must not leave a
        // half-written reflection on the bubble).
        const agentReasoning = reasoningRelay(fromWire, (t) => updateAssistant({ reasoning: t }));
        try {
          // Live tool-call NARRATION (always on when the host can complete): a
          // SMALL parallel model call turns each tool call into a one-line human status
          // shown in the bubble while the tool round-trips (a web search is 6-12s of dead
          // air). WIRE-SAFE — it sees the SAME redacted fakes the main model did; the
          // sentence is un-redacted via `fromWire` before display, exactly like onText.
          // Reuses the turn's OWN provider/model/creds (host.complete → main injects the
          // provider key, or the platform token/baseUrl), so it's FREE on free models and
          // negligible otherwise. Bounded by a timeout; resolves to "" on any failure so
          // it NEVER blocks or breaks the loop (falls back to the template label).
          const summarizeToolCall =
            host.complete
              ? async (info: { tool: string; server: string; args: Record<string, unknown> }): Promise<string> => {
                  let argsText: string;
                  try {
                    argsText = JSON.stringify(info.args).slice(0, 800);
                  } catch {
                    argsText = "{}";
                  }
                  try {
                    const reply = await Promise.race([
                      host.complete!({
                        provider,
                        model: model.id,
                        apiKey: platform ? platformToken : undefined,
                        baseUrl: platform
                          ? platformBaseUrl
                          : provider === "openai-compat"
                            ? settings.openaiCompatBaseUrl
                            : undefined,
                        temperature: 0,
                        messages: [
                          { role: "system", content: t.agent.toolIntentSystem },
                          { role: "user", content: `Outil : ${info.server} · ${info.tool}\nArguments : ${argsText}` },
                        ],
                      }),
                      new Promise<string>((_, rej) =>
                        setTimeout(() => rej(new Error("tool summary timed out")), TOOL_SUMMARY_TIMEOUT_MS),
                      ),
                    ]);
                    // Un-redact (fakes → real) like every model reply, and keep it to one
                    // tidy line so a chatty model can't blow out the bubble status.
                    return fromWire(reply).replace(/\s+/g, " ").trim().slice(0, 140);
                  } catch {
                    return ""; // timeout / no key / provider error → silent fallback
                  }
                }
              : undefined;

          // Pre-search REVEAL gate: offer to STOP redacting the categories that make a web
          // answer meaningless when faked (public web content's place/org/person names are
          // usually the answer's substance — a search about "Russie" summarises French news
          // as Russian). Reads the LIVE conversation (`conversationsRef`) so it reflects the
          // categories actually active; no-ops (resolves at once) when nothing's offerable.
          //
          // ⚠️ **THIS MESSAGE ONLY** (18/08). The choice is no longer written to the
          // conversation: it applies to the current send, and the next one goes out redacted
          // again. An un-redaction decided for ONE search has no reason to follow the twenty
          // messages after it — that's the kind of scope you grant once and forget, and
          // the card had to state it in full to stay honest.
          // Accepted corollary: the question is asked on EVERY send that deserves it (a
          // search carrying an offerable redacted value), plus exactly once per
          // conversation — one decision per message is the price of one scope per
          // message. The loop itself only asks ONCE per send (`webNavAsked`).
          //
          // ⚠️ This changes only what the MODEL sees. The query itself always carries the
          // REAL value (rule 11) whatever is picked here; revealing stops the RESULT coming
          // back as a fake the model must then reason over.
          const confirmWebNav = opts?.reviewWebNav
            ? async (): Promise<void> => {
                // PRISTINE conversation: nothing has been redacted so far — the current
                // send included (`vault` was filled when the user message was redacted,
                // before the loop ran). A reveal could change nothing and the card's
                // warning would be false, so don't interrupt. Pinned by
                // `evals/navigation.test.ts`.
                if (!Object.keys(vault).length) return;
                const live = conversationsRef.current.find((c) => c.id === convId) ?? conv;
                const offerable = webNavOfferableCategories(
                  live,
                  settings,
                  orgProfileRef.current?.forcedCategories ?? [],
                );
                if (!offerable.length) return;
                const picked = await opts.reviewWebNav!(offerable, convId!);
                // The card returns what the user accepted to reveal — the whole offer
                // ("Passer en Standard") or nothing. `[]` is also the closed value of a
                // Stop / a card left pending. `webNavRevealSet` re-filters against
                // `offerable`: the renderer is not a trust boundary (rule 7). Pinned by
                // `webNavReveal.test.ts`.
                const reveal = webNavRevealSet(picked, offerable);
                if (reveal.length) {
                  // The ONLY write: `disabledKinds`, THIS send's state, frozen at the
                  // start — so BEFORE this blocking gate. Without this line, the
                  // ongoing search's RESULTS (redacted via `disabledForTool`, which
                  // reads this same array) would stay masked: that's the "I revealed
                  // it for the search and it's still redacted" bug we fixed. We
                  // mutate the shared array in place so `disabledForTool` and the
                  // loop's client see it right away.
                  for (const k of reveal) if (!disabledKinds.includes(k)) disabledKinds.push(k);
                }
              }
            : undefined;

          // Un-fake ONLY the tokens whose category is disabled NOW (the reveal gate just
          // mutated `disabledKinds` in place) in an already-wired string. The loop maps
          // its whole in-flight context through this right after the gate, so the reveal
          // takes effect for the REST OF THIS TURN — not only from the next send.
          // `turnKinds` (not `convKinds`): on a first message only it knows the fresh
          // spans' categories. Recomputed per call because `disabledKinds` just changed.
          const rewireWire = (s: string): string => {
            const excl = disabledVaultTokens(vault, {
              numbers: redactNumbersOn(settings),
              disabledKinds,
              kinds: turnKinds,
            });
            if (!excl.size) return s;
            const sub: Vault = {};
            for (const t of excl) sub[t] = vault[t];
            return unredact(s, sub);
          };

          // Write-idempotency ledger (retry-safety): seed the in-memory set from what's
          // already persisted on the conversation, so a "Réessayer" recognises a side-
          // effecting call that already SUCCEEDED in the failed attempt and does NOT repeat
          // it. Keys are hashes of redacted args (no PII) → they ride the normal persistence.
          const completedWrites = new Set<string>(conv.writeLedger ?? []);
          const LEDGER_CAP = 200; // bound growth (writes are confirm-gated, so rare)

          // Deliverables run_python produced EARLIER IN THIS TURN — `conv` is a snapshot,
          // so a 2nd call the same turn can't find them in `conv.messages`; they seed the
          // next run from here (freshest version of a name wins in loadPythonSeeds).
          const turnPyFiles: { name: string; base64: string }[] = [];

          const handled = await runMcpAgentLoop({
            host,
            provider,
            modelId: model.id,
            confirmWebNav,
            rewireWire,
            // The MÉMOIRE lookup — local, REAL-valued; the loop owns the un-redact/re-redacted
            // halves. Only offered when there is anything to search — and never when the
            // conversation is "sans mémoire" (the switch cuts BOTH directions, otherwise
            // it lies: the model could retrieve via the tool what the injection no longer gives).
            searchMemory:
              !conv.memoryOff &&
              settings.memoire &&
              (settings.memoire.profile?.trim() || settings.memoire.cards.length)
                ? // Hybrid: lexical first, completed by the on-device SEMANTIC recall
                  // when the host offers it ("my client in the audio sector" without naming them).
                  (q: string) =>
                    searchMemoryHybrid(
                      settings.memoire,
                      q,
                      host.memoryIndex?.query
                        ? (t, k) => host.memoryIndex!.query!(t, k)
                        : undefined,
                    )
                : undefined,
            // Parallel human narration of each tool call (+ its live bubble status).
            summarizeToolCall,
            onToolProgress: (text) => updateAssistant({ toolStatus: text }),
            signal: toolController.signal,
            requestId: toolRequestId,
            convId,
            // Retry-safety (Option A): this turn's id + the per-conversation ledger, so a
            // side-effecting call that already completed isn't re-run on a "Réessayer".
            turnId,
            writeLedgerHas: (key) => completedWrites.has(key),
            onWriteDone: (key) => {
              if (completedWrites.has(key)) return;
              completedWrites.add(key);
              patchConversation(convId!, (c) => {
                const next = [...(c.writeLedger ?? []), key];
                return {
                  ...c,
                  writeLedger: next.length > LEDGER_CAP ? next.slice(next.length - LEDGER_CAP) : next,
                };
              });
            },
            // Resume (Option B): RAM covers a retry in-session, `conv.turnCheckpoint` (the
            // encrypted DB) a crash/quit mid-turn — replayed with every unanswered tool call
            // SEALED as interrupted (`agent/turnCheckpoint.ts`).
            resumeTranscript: resumeMessagesFor(
              resumeTranscriptsRef.current,
              conv.turnCheckpoint as TurnCheckpoint | undefined,
              turnId,
              Date.now(),
            ),
            onResumeTranscript: (t) => {
              const cp = rememberTranscript(resumeTranscriptsRef.current, turnId, t, Date.now());
              patchConversation(convId!, (c) => ({ ...c, turnCheckpoint: cp }));
            },
            // apiKey injected in main (chat:complete-tools) from the encrypted
            // store, EXCEPT platform models which carry the Supabase JWT + the
            // backend inference base URL (the platform holds the provider key).
            apiKey: platform ? platformToken : undefined,
            baseUrl: platform
              ? platformBaseUrl
              : provider === "openai-compat"
                ? settings.openaiCompatBaseUrl
                : undefined,
            history,
            vault,
            // The FULL Coffre rides along (not `forcedList`, which is filtered to values
            // present in THIS message): the loop's dynamic browser redaction must
            // escalate to full redaction when a page shows a Coffre value the user never
            // typed this send — its contract is "always redacted", whatever the source.
            secrets: [
              ...extraSecrets,
              ...(settings.coffre ?? []).map((t) => t.value.trim()).filter(Boolean),
            ],
            disabledKinds,
            structuralUrlHosts: engineCtx.structuralUrlHosts,
            // Org enforcement: strip tools from any connector the org disallows,
            // so a blocked server can't be invoked even if already connected.
            allowedServerIds: orgProfileRef.current?.allowedMcpIds,
            // Agent-browser prompt-injection hardening: read-only mode strips the
            // browser's write tools; the allow-list bounds where it may navigate.
            browserReadOnly: settings.browserReadOnly,
            browserAllowedDomains: settings.browserAllowedDomains,
            // The scope of the compétence used. `servers` used to be ONLY guidance in the
            // prompt: the router — a model call — could drop the tools of the
            // requested connector and leave it unreachable without `load_tools` (log from
            // 27/07/2026: empty pick on a routine scoped to Google Agenda). WIDENS
            // the offer. Falls back to the LAST one used (`activeCompetenceScope`, which also
            // reads the old `workflow` tag from history).
            scopedConnectors: opts?.competence?.servers?.length
              ? opts.competence.servers
              : activeSkillScope(conv.messages),
            // Tool-routing/catalog threshold override — undefined in every REAL send
            // (ChatView never sets it); only the eval bench passes one to sweep the
            // latency/conformance trade-off of a leaner reduction (`evals/strategies.ts`).
            routingConfig: opts?.routingConfig,
            // The app has a built-in browser that can be enabled → never suggest a paid
            // search connector (Exa/Tavily/Firecrawl) for web search; steer the user to
            // enable the free built-in browser instead.
            browserEnableable: !!host.mcp?.enableBrowser,
            // Tool RESULTS redacted with the same engine as the chat (remote /
            // model / regex), ALWAYS as reversible fakes — see redactToolResult.
            redactResult: redactToolResult,
            // Colours the Debug Log's redacted↔original mapping. `turnKinds`, not
            // `convKinds`, so this turn's freshly-vaulted spans are labelled too.
            kinds: turnKinds,
            // User confirmation before a MUTATING tool call (ChatView opens a
            // dialog). Absent when the setting is off → no gate. The loop's own
            // shape carries no conversation id (it runs for exactly one turn), so
            // bind THIS turn's `convId` here — the renderer needs it to tell whose
            // card it is showing.
            confirmWrite: opts?.confirmToolWrite
              ? (info) => opts.confirmToolWrite!(info, convId!)
              : undefined,
            // Resolve file names the model wants to ATTACH (Gmail) → the ORIGINAL
            // bytes of the conversation's local files (base64). The file goes out via
            // the user's own account; the model never sees the bytes. Matches by real
            // name; a generic/unmatched reference falls back to the conversation's docs.
            resolveAttachments: async (names) => {
              if (!host.db?.listFiles || !host.db?.loadFile) return [];
              const fileConvId = conv.sessionConversationId || convId!;
              const metas = await host.db.listFiles(fileConvId).catch(() => []);
              if (!metas.length) return [];
              // Name match ONLY (audit M1, `pickAttachmentMetas`): a miss returns
              // NOTHING. The previous "fall back to ALL of the conversation's stored
              // files" branch let a prompt-injected model attach every stored document
              // to an attacker recipient just by naming a file that doesn't exist —
              // these are the user's REAL (un-redacted) bytes leaving via their own
              // account, past the string-only arg-exfil gate. Requiring an explicit
              // name match fails closed; the resolved set is also surfaced in the
              // write-confirmation card.
              const picked = pickAttachmentMetas(metas, names);
              const out: { filename: string; mimeType: string; contentBase64: string }[] = [];
              for (const m of picked) {
                const f = await host.db.loadFile!(m.id).catch(() => null);
                if (!f?.original?.length) continue;
                out.push({ filename: f.name, mimeType: f.mime, contentBase64: bytesToBase64(f.original) });
              }
              return out;
            },
            // Code interpreter: run model-generated Python in the sandbox. Offered on
            // every turn the host has one — there is no user opt-out.
            //
            // ⚠️ ACCEPTED RESIDUAL RISK (rule 7). The model only ever sees fakes, but
            // `mcpAgent` DE-REDACTS the code (`fromWire`) before running it, so the
            // executed code DOES hold the user's real data; only the model-facing stdout
            // is re-redacted afterwards. The sandbox's egress + FS confinement
            // (`apps/desktop/src/main/python/`) are therefore the ONLY thing between the
            // user's PII and the network — not a second line of defence. Weakening a jail
            // rule there is a direct PII egress, not a defence-in-depth regression. A
            // platform with no jail refuses to run at all (`sandbox.ts`) — the
            // fail-closed leg.
            runPython:
              host.python
                ? // Stream the runner's live status (download %, install, "Exécution…",
                  // the code's latest stdout line) onto the message so the "en cours…"
                  // indicator EVOLVES instead of sitting static. Prior deliverables are
                  // SEEDED into the sandbox CWD (loadPythonSeeds — prior turns from the
                  // DB + this turn's runs) so « modifie/enrichis ce fichier » can LOAD
                  // the file; main re-sanitizes the seeds and skips re-delivering an
                  // unchanged one. The conversation's LAST working script seeds too
                  // (`analyse.py`) — derived from `Message.pythonScript` (wire, fakes)
                  // through this send's `fromWire` (the vault replay restores the real
                  // values), so iteration can `exec(open("analyse.py").read())` — no
                  // stored file, no UI, one source of truth.
                  async (code) => {
                    const priorScript = [...conv.messages]
                      .reverse()
                      .find((m) => m.role === "assistant" && m.pythonScript)?.pythonScript;
                    const scriptSeed = priorScript
                      ? [
                          {
                            name: "analyse.py",
                            base64: bytesToBase64(new TextEncoder().encode(fromWire(priorScript))),
                          },
                        ]
                      : [];
                    const seeds = await loadPythonSeeds({
                      listFiles: host.db?.listFiles?.bind(host.db),
                      loadFile: host.db?.loadFile?.bind(host.db),
                      toBase64: bytesToBase64,
                      conversationId: conv.sessionConversationId || convId!,
                      messages: conv.messages,
                      // This turn's entries come LAST → they win over the prior-turn script.
                      turnFiles: [...scriptSeed, ...turnPyFiles],
                    });
                    return host.python!.run(
                      code,
                      (status) => updateAssistant({ toolStatus: status }),
                      seeds,
                    );
                  }
                : undefined,
            // Batch web reader (`web_fetch_many`): fetch several URLs in parallel. The
            // loop un-redacts each URL before this and re-redacted the results after.
            fetchMany: host.web ? (urls) => host.web!.fetchMany(urls) : undefined,
            // A figure produced by run_python (PNG base64) → store it locally and pin
            // it as an inline image on the assistant message (same render path as a
            // tool-exported image: MessageImages resolves it by name → data: URL).
            // A failed save THROWS through to the loop, which counts the delivery as
            // failed and tells the model so — swallowing it here let the model announce
            // « figure affichée » about an image that exists nowhere (audit, rule
            // « un échec réel est toujours montré »). The loop never breaks the turn.
            onPythonImage: async (img) => {
              if (!host.db?.saveFile) return;
              const fileConvId = conv.sessionConversationId || convId!;
              // The READABLE name comes from the sandbox (matplotlib title slug — wheels.ts),
              // never again an opaque `python-<uid>.png`. Uniqueness PER CONVERSATION:
              // `findStoredFile` resolves a click by name, last one wins (storedFiles.ts).
              const stored = (await host.db.listFiles?.(fileConvId).catch(() => [])) ?? [];
              const name = uniqueFileName(img.name, new Set(stored.map((m) => m.name)));
              await host.db.saveFile({
                id: uid(),
                conversationId: fileConvId,
                name,
                mime: "image/png",
                redacted: false,
                original: base64ToBytes(img.base64),
                scrubbed: null,
              });
              patchConversation(convId!, (c) => ({
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, attachments: [...(m.attachments ?? []), { name, kind: "image", mime: "image/png" }] }
                    : m,
                ),
                updatedAt: Date.now(),
              }));
            },
            // A DELIVERABLE file produced by run_python (PDF/xlsx/docx…) → store it and
            // pin it as a downloadable chip (or inline if it's an image), same render
            // path as a tool-exported file. The code ran DE-REDACTED (mcpAgent), so the
            // file holds the user's REAL data — store it as-is (the user's deliverable);
            // only the model-facing stdout was re-redacted.
            // A run_python SUCCEEDED → keep its script as the conversation's working
            // script (`Message.pythonScript`, WIRE form — fakes, safe in localStorage).
            // NO UI: it is replayed in the wire history (buildWire) so the model
            // iterates instead of regenerating, and seeded into the sandbox CWD as
            // `analyse.py` (derived above). Skipped over the cap — a truncated base
            // misleads more than it helps.
            onPythonScript: (wireCode) => {
              const PY_SCRIPT_WIRE_CAP = 6000;
              if (!wireCode.trim() || wireCode.length > PY_SCRIPT_WIRE_CAP) return;
              const seed = {
                name: "analyse.py",
                base64: bytesToBase64(new TextEncoder().encode(fromWire(wireCode))),
              };
              const si = turnPyFiles.findIndex((f) => f.name === seed.name);
              if (si >= 0) turnPyFiles[si] = seed;
              else turnPyFiles.push(seed);
              patchConversation(convId!, (c) => ({
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantMsg.id ? { ...m, pythonScript: wireCode } : m,
                ),
                updatedAt: Date.now(),
              }));
            },
            onPythonFile: async (file) => {
              // Remember it for THIS turn's later runs (seeded back into the sandbox),
              // whether or not a DB is there to persist it.
              turnPyFiles.push({ name: file.name, base64: file.base64 });
              if (!host.db?.saveFile) return;
              const fileConvId = conv.sessionConversationId || convId!;
              const kind = file.mime.startsWith("image/") ? "image" : "file";
              // A failed save THROWS through to the loop (same contract as
              // onPythonImage): the loop counts the delivery failed and tells the
              // model, instead of letting it announce a chip that never appeared.
              await host.db.saveFile({
                id: uid(),
                conversationId: fileConvId,
                name: file.name,
                mime: file.mime,
                redacted: false,
                original: base64ToBytes(file.base64),
                scrubbed: null,
              });
              patchConversation(convId!, (c) => ({
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, attachments: [...(m.attachments ?? []), { name: file.name, kind, mime: file.mime }] }
                    : m,
                ),
                updatedAt: Date.now(),
              }));
            },
            fromWire,
            // URL/args-aware un-redaction for the write-confirmation display.
            fromWireArgs,
            // The FIRST sign of generation this turn — prose OR a streaming tool-call
            // argument. Marks TTFT even for a TOOL-FIRST turn (no prose), which onText
            // alone missed → those (the slowest, 298-tool) turns recorded no latency.
            onFirstToken: () => {
              if (!mTFirst) mTFirst = Date.now();
            },
            // The model is STREAMING a tool-call argument (a big run_python/write_file
            // body, no prose) — surface the CONCRETE action + live char-count on the
            // "thinking" indicator so it EVOLVES instead of a frozen rotating phrase.
            // Cleared by onText/onToolCall when the turn moves on.
            onToolArgs: (chars, name) => updateAssistant({ toolStatus: toolActionLabel(name, chars) }),
            onReasoning: agentReasoning.push, // the live reflection, in place of the loader
            onText: (content, pending) => {
              if (!mTFirst && content) mTFirst = Date.now(); // first token of the agentic turn
              updateAssistant({ content, pending, toolCall: undefined, toolStatus: undefined });
            },
            onToolCall: (name) => {
              // A browser tool is starting → nudge the UI to reveal the live browser panel.
              if (name && isBrowserTool(name)) setBrowserActivity((n) => n + 1);
              // A new/cleared tool resets the live status (run_python re-sets its own).
              updateAssistant({ toolCall: name ?? undefined, toolStatus: undefined, pending: true });
            },
            // Append each finished tool call to the message's PERSISTED tool trace
            // (survives reload), keyed off the live message so the list grows in order.
            // The vault rides along INCREMENTALLY: a tool result may have minted new
            // fake↔real pairs (the loop mutates `vault` in place), and the assistant
            // text is persisted UN-redacted — if the turn later fails or is stopped,
            // an uncommitted vault would make the next send replay the REAL value in
            // clear (history is vault-replay only, never re-detected). Snapshot-spread,
            // never the live reference: the loop keeps mutating it.
            onToolResult: (entry) =>
              patchConversation(convId!, (c) => ({
                ...c,
                redactionVault: { ...vault },
                redactionSalt,
                redactionKey,
                redactionMode,
                redactionKinds: { ...c.redactionKinds, ...toolKinds },
                messages: c.messages.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, toolCalls: [...(m.toolCalls ?? []), entry] }
                    : m,
                ),
                updatedAt: Date.now(),
              })),
            onQuotaLeft: (quotaLeft) => updateAssistant({ quotaLeft }), // cf. `Message.quotaLeft`
            onUsage: (usage) => {
              agentUsageReported = true;
              updateAssistant({
                usage: {
                  model: model.id,
                  inputTokens: usage.inputTokens,
                  outputTokens: usage.outputTokens,
                  billed: effectivePlatform ? "subscription" : "byo",
                },
              });
              captureEvent({
                name: "token_usage",
                provider,
                model: model.id,
                input: usage.inputTokens,
                output: usage.outputTokens,
                // COUNTS, never content: the share of input served by the provider's
                // cache and the share that had to be written to it. This is what makes
                // extending the caching arbitrable (an unstable prefix re-primes on
                // every turn and costs MORE than no cache at all).
                ...(usage.cachedInputTokens ? { cached: usage.cachedInputTokens } : {}),
                ...(usage.cacheWriteInputTokens ? { cacheWrite: usage.cacheWriteInputTokens } : {}),
              });
              emitModelLatency(mT0, mTFirst, usage.outputTokens, true, usage.toolCount, usage.inputTokens);
              updateDebug(wireDebugId, {
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                cachedInputTokens: usage.cachedInputTokens,
                // The agentic turn's cumulative total carries the number of exchanges it covers —
                // without which it reads as the cost of THIS one message alone (see `debug.ts`).
                modelTurns: usage.modelTurns,
              });
            },
            onToolStruggle: ({ server, tool, kind }) =>
              updateAssistant({ toolStruggle: { server, tool, kind, model: model.id } }),
            // The model can't act without a NOT-connected integration → pin the
            // suggested connector ids so the bubble renders clickable connect cards.
            onSuggestIntegrations: (ids) => updateAssistant({ suggestedIntegrations: ids }),
            // A tool returned a downloadable file URL (already stripped from the
            // model's view). Fetch it in main, redact + store it like a user
            // attachment, and pin a file chip on the assistant message.
            onExportedFile: async (url, mime) => {
              if (!host.files?.fetchUrl || !host.files?.redactAndSave) return;
              const fileConvId = conv.sessionConversationId || convId!;
              try {
                const f = await host.files.fetchUrl(url);
                const { vault: merged, kinds, spans } = await host.files.redactAndSave({
                  id: uid(),
                  conversationId: fileConvId,
                  path: f.path,
                  name: f.name,
                  mime: f.mime || mime,
                  vault,
                  disabledKinds,
                });
                const attMime = f.mime || mime;
                // An image (e.g. a Canva design thumbnail) renders INLINE in the
                // bubble; any other file stays a click-to-open chip.
                const attKind = attMime.startsWith("image/") ? "image" : "file";
                patchConversation(convId!, (c) => ({
                  ...c,
                  redactionVault: merged,
                  redactionKinds: { ...c.redactionKinds, ...kinds },
                  messages: c.messages.map((m) =>
                    m.id === assistantMsg.id
                      ? {
                          ...m,
                          attachments: [
                            ...(m.attachments ?? []),
                            { name: f.name, kind: attKind, mime: attMime },
                          ],
                        }
                      : m,
                  ),
                  fileRedactions: spans.length
                    ? [...(c.fileRedactions ?? []), { name: f.name, spans, at: Date.now() }]
                    : c.fileRedactions,
                }));
              } catch {
                // The link was ALREADY stripped from the model's view ("shown to
                // the user") — a failed fetch means the file exists for NOBODY.
                // The turn survives, but the trace says so instead of silence (house
                // rule: a real failure is always shown).
                patchConversation(convId!, (c) => ({
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMsg.id
                      ? {
                          ...m,
                          toolCalls: [
                            ...(m.toolCalls ?? []),
                            {
                              tool: "export",
                              server: "web",
                              ok: false,
                              note: t.errors.exportedFileLost,
                            },
                          ],
                        }
                      : m,
                  ),
                  updatedAt: Date.now(),
                }));
              }
            },
          });
          agentReasoning.done(); // the turn is over — seal its reflection, complete
          if (handled) {
            cancelRef.current.delete(convId!);
            finishRef.current.delete(convId!);
            // `handled === true` also covers a mid-turn Stop (`finalizeAborted`): the
            // turn is NOT settled then — a dispatched write may still be in flight with
            // no recorded outcome, so the durable checkpoint must SURVIVE for the retry
            // to see its calls sealed as interrupted (`sealInterruptedCalls`). Only a
            // turn that ran to completion clears it.
            const settled = !toolController.signal.aborted;
            patchConversation(convId!, (c) => ({
              ...c,
              redactionVault: { ...vault },
              redactionSalt,
              redactionKey,
              redactionMode,
              // Persist the categories learned from tool-result/document redaction so
              // those values get their per-type colour (not the red fallback).
              redactionKinds: { ...c.redactionKinds, ...toolKinds },
              turnCheckpoint: settled ? undefined : c.turnCheckpoint,
              updatedAt: Date.now(),
            }));
            setIsStreaming(false);
            return;
          }
        } catch (err) {
          agentReasoning.done(); // same on the failing path — a failed turn still explains itself
          cancelRef.current.delete(convId!);
          finishRef.current.delete(convId!);
          // Whatever ends the turn, the vault entries minted by its tool results are
          // COMMITTED: the assistant text on screen is already un-redacted, so losing
          // them would replay real values in clear on the next send (see onToolResult).
          const commitTurnVault = () =>
            patchConversation(convId!, (c) => ({
              ...c,
              redactionVault: { ...vault },
              redactionSalt,
              redactionKey,
              redactionMode,
              redactionKinds: { ...c.redactionKinds, ...toolKinds },
              updatedAt: Date.now(),
            }));
          // Stop pressed mid tool-loop: the loop already finalized the bubble, so
          // don't surface an error banner — just settle.
          if (toolController.signal.aborted) {
            commitTurnVault();
            setIsStreaming(false);
            return;
          }
          // Surface the RAW provider/tool error in the Debug Log (Settings →
          // Développeur → Erreurs) so a 429 / tool failure is diagnosable without
          // DevTools — the friendly "slow down" banner alone hides the real detail.
          const toolErrDetail = err instanceof Error ? err.message : String(err);
          dbg({
            type: "error",
            scope: `tool · ${model.id}`,
            message: isRateLimitError(err) ? `rate limit (429) — ${toolErrDetail}` : toolErrDetail,
          });
          // Error-tracking channel (anonymised): a thrown agentic-loop failure is a
          // bug/outage worth catching early, separate from the `send_error` event.
          captureError({
            scope: "mcp",
            code: isRateLimitError(err) ? "rate-limit" : "tool-loop",
            name: err instanceof Error ? err.name : undefined,
            message: toolErrDetail,
          });
          // `send_error` on the AGENT path too (audit 2026-08-10): as soon as a
          // connector is connected, every send goes through the loop — emitting the event
          // only from the plain path reproduced the "zero send_error in 30 days"
          // that the stream's comment describes as resolved. BOUNDED code, never the raw one.
          captureEvent({
            name: "send_error",
            provider: model.provider,
            model: model.id,
            reason: sendErrorReason(toolErrDetail),
            // The three fields that were missing from EVERY real failure (audit 13/08) — the
            // `requestId` joined to the gateway's `inference_upstream_error`.
            status: httpStatus(toolErrDetail),
            requestId: requestIdOf(toolErrDetail),
            retries: retriesOf(toolErrDetail),
          });
          // Persist the failure INLINE on the assistant bubble (like the stream `onError`
          // path) — survives reload and offers "Réessayer". Known bounded codes → a human
          // message; unknown → strip the IPC/JSON noise. Never the raw dump.
          // ⚠️ `humanizeSendError` FIRST, 429 included (errors.test.ts); the action follows
          // the cause (periodic quota → subscription, refused key / empty account → key).
          const act = sendErrorAction(toolErrDetail, model.provider);
          const friendly =
            humanizeSendError(toolErrDetail, t, { personal: !orgProfileRef.current, provider: model.provider }) ?? fromWire(cleanErrorText(toolErrDetail));
          commitTurnVault();
          updateAssistant({
            pending: false,
            error: true,
            errorText: friendly,
            ...(act ? { errorAction: act } : {}),
            // An agentic turn that fails has already CONSUMED tokens (the history went
            // out, often several exchanges): estimate rather than record zero
            // — same rule as the plain path. A usage already REPORTED is never
            // overwritten by an estimate.
            ...(agentUsageReported
              ? {}
              : {
                  usage: {
                    model: model.id,
                    ...estimateTurnUsage(history, ""),
                    billed: (effectivePlatform ? "subscription" : "byo") as "subscription" | "byo",
                    estimated: true,
                  },
                }),
          });
          setIsStreaming(false);
          return;
        }
      }

      const streamError: string | null = null;
      await new Promise<void>((resolve) => {
        let acc = "";
        let settled = false;

        // Watchdog: never let the loader spin forever. If nothing arrives in
        // time — a stalled stream — we fail gracefully so the user can retry.
        // Re-armed on every token, so a slow-but-progressing reply is never cut off.
        // Reset the latency clock to THIS (plain-stream) dispatch — reached only
        // when the agentic loop didn't handle the turn.
        mT0 = Date.now();
        mTFirst = 0;
        const STARTUP_MS = 75000; // time to first token
        const STALL_MS = 45000; // gap between tokens once streaming
        let watchdog: ReturnType<typeof setTimeout> | undefined;
        // The message says what ACTUALLY happened (a dead stream, never the old
        // English text blaming the session); on a stall, `onError` keeps the part already received.
        const armWatchdog = (ms: number, msg: string) => {
          if (watchdog) clearTimeout(watchdog);
          watchdog = setTimeout(() => onError(msg), ms);
        };

        // COALESCE per-token UI updates to ~animation cadence. `fromWire` (un-redact of
        // the WHOLE accumulated reply) AND the bubble's markdown re-parse both cost
        // O(content), so running them on EVERY token was O(n²) per reply — and it
        // multiplied across concurrent streams on the single renderer thread (the reported
        // "slow when several tasks run at once"). `acc` still grows per token (a cheap
        // string append); the expensive flush runs at most every FLUSH_MS. `onDone` does a
        // final exact flush, so the settled content is always correct.
        const FLUSH_MS = 40;
        let flushTimer: ReturnType<typeof setTimeout> | undefined;
        let dirty = false;
        const flush = () => {
          flushTimer = undefined;
          if (!dirty || settled) return;
          dirty = false;
          updateAssistant({ content: fromWire(acc), pending: true });
        };
        const scheduleFlush = () => {
          dirty = true;
          if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
        };
        const clearFlush = () => {
          if (flushTimer) clearTimeout(flushTimer);
          flushTimer = undefined;
        };

        // The REFLECTION: its own channel, sealed when the turn settles, never in `acc`.
        const reasoning = reasoningRelay(fromWire, (t) => updateAssistant({ reasoning: t }));
        const onDelta = (delta: string) => {
          if (settled) return;
          if (!mTFirst && delta) mTFirst = Date.now(); // first token of the plain stream
          acc += delta;
          armWatchdog(STALL_MS, t.errors.replyInterrupted);
          scheduleFlush(); // de-redact + render throttled to ~animation cadence
        };
        /** What this turn actually cost, measured when the provider told us and
         *  ESTIMATED when it couldn't (Stop, a dropped stream, a provider that never
         *  reports). Never nothing — see `send/estimateUsage.ts` for why zero is the
         *  one answer that is certainly wrong. */
        const turnUsage = (reported?: { inputTokens: number; outputTokens: number }) => {
          const measured = !!reported;
          const counts = reported ?? estimateTurnUsage(history, acc);
          return {
            model: model.id,
            inputTokens: counts.inputTokens,
            outputTokens: counts.outputTokens,
            billed: (effectivePlatform ? "subscription" : "byo") as "subscription" | "byo",
            ...(measured ? {} : { estimated: true }),
          };
        };
        const onDone = (done?: StreamDone) => {
          if (settled) return;
          clearFlush(); // no stale throttled flush after the final content
          reasoning.done(); // …and the reflection is sealed, tail included, beside it
          const usage = done?.usage;
          const restored = fromWire(acc);
          // TRUNCATED (max-tokens `length`, or a stream that dropped without a
          // clean end = `cut`) OR empty → the answer is INCOMPLETE. Flag it so the
          // bubble shows the "Réponse interrompue" notice + a Réessayer that
          // regenerates IN PLACE — without it a cut-off reply looked "done" and the
          // only way to retry was to re-type, which duplicated the message.
          // A MISSING finish reads as `cut`, not as complete (audit 2026-08-10):
          // every in-repo provider now always reports one (`google.test.ts` pins it),
          // so `undefined` only remains on an aborted/dropped stream — exactly the
          // case that used to slip through as « terminé » (streamGoogle never set it,
          // and a Gemini reply cut short displayed as complete).
          const truncated =
            done?.finish === "length" || done?.finish === "cut" || done?.finish == null;
          updateAssistant({
            content: restored,
            pending: false,
            incomplete: restored.trim() === "" || truncated,
            // Most providers report token usage; some (openai-compat/local) don't, and
            // Stop / a dropped stream cuts the frame that carries it. Estimate rather
            // than record nothing — a stopped turn still costs.
            usage: turnUsage(usage),
          });
          // Telemetry stays MEASURED-only, deliberately: the bubble's estimate is good
          // enough to bill against but would skew tokens/s and the aggregate token
          // counts if it rode the same events as real provider numbers.
          if (usage) {
            captureEvent({
              name: "token_usage",
              provider,
              model: model.id,
              input: usage.inputTokens,
              output: usage.outputTokens,
              // The SIMPLE chat also caches the system prompt (`cache_control` /
              // `prompt_cache_key`): without these two counters, only the agentic loop
              // would be measurable and we'd be comparing two paths on different bases.
              ...(usage.cachedInputTokens ? { cached: usage.cachedInputTokens } : {}),
              ...(usage.cacheWriteInputTokens ? { cacheWrite: usage.cacheWriteInputTokens } : {}),
            });
            emitModelLatency(mT0, mTFirst, usage.outputTokens, false, 0, usage.inputTokens);
            updateDebug(wireDebugId, {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              cachedInputTokens: usage.cachedInputTokens,
            });
          }
          finish();
        };
        const onError = (message: string) => {
          if (settled) return;
          clearFlush();
          reasoning.done();
          const restored = fromWire(acc);
          // Debug Log keeps the RAW detail; the bubble shows the humanised message.
          const rawMsg = fromWire(message);
          const safeMsg =
            humanizeSendError(message, t, { personal: !orgProfileRef.current, provider: model.provider }) ?? fromWire(cleanErrorText(message));
          const act = sendErrorAction(message, model.provider); // a PROPOSED way out, not just stated
          dbg({ type: "error", scope: `stream · ${model.id}`, message: rawMsg });
          // The send failure rate was DEAD in PostHog: `send_error` was only emitted
          // from ChatView's `catch`, which no longer fires now that
          // the failure is PERSISTED here instead of being rethrown — zero `send_error` in
          // production over 30 days for 192 sends. It now fires from where the failure
          // actually happens, with a BOUNDED code (never the raw text).
          captureEvent({
            name: "send_error",
            provider: model.provider,
            model: model.id,
            reason: sendErrorReason(message),
            status: httpStatus(message),
            requestId: requestIdOf(message),
            retries: retriesOf(message),
          });
          // PERSIST the failure ON the assistant bubble (keeping any partial reply),
          // instead of dropping it + a transient banner. It then survives a reload
          // and shows a "Réessayer" that regenerates in place — the user can't
          // accidentally re-send the same message twice. No banner is thrown.
          updateAssistant({
            content: restored,
            pending: false,
            error: true,
            errorText: safeMsg,
            ...(act ? { errorAction: act } : {}),
            // A failure AFTER partial output still consumed tokens; only a turn that
            // never streamed anything (auth refused, no endpoint) genuinely cost nothing.
            ...(acc ? { usage: turnUsage() } : {}),
          });
          finish();
        };

        // Dispatch the request. Any synchronous failure here must surface as an
        // error and finish — never leave the loader spinning.
        try {
          const cancel = host.startChat(
            {
              requestId: uid(),
              provider,
              model: model.id,
              messages: history,
              // apiKey injected in main (chat:start) from the encrypted store,
              // EXCEPT platform models which carry the Supabase JWT + base URL.
              apiKey: platform ? platformToken : undefined,
              baseUrl: platform
                ? platformBaseUrl
                : provider === "openai-compat"
                  ? settings.openaiCompatBaseUrl
                  : undefined,
            },
            { onChunk: onDelta, onReasoning: reasoning.push, onDone, onError },
          );
          cancelRef.current.set(convId!, cancel);

          // Start the clock now that the request is in flight, and let Stop
          // finalize this stream directly (treats the partial reply as complete).
          armWatchdog(STARTUP_MS, t.errors.replyNeverStarted);
          finishRef.current.set(convId!, onDone);
        } catch (err) {
          onError(err instanceof Error ? err.message : String(err));
        }

        function finish() {
          settled = true;
          if (watchdog) clearTimeout(watchdog);
          cancelRef.current.delete(convId!);
          finishRef.current.delete(convId!);
          setIsStreaming(false);
          resolve();
        }
      });
      // A streaming/transport error surfaces as a ChatView banner + detail modal,
      // not as an error bubble in the conversation.
      if (streamError) throw new Error(streamError);
    }
  );
}
