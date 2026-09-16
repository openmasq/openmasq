import type { ModelInfo, ProviderId } from "@openmasq/llm";
import { asksConsultNotAct } from "../../agent/readIntent";
import { captureEvent } from "../../analytics";
import type { ExtractedFile } from "../../host";
import { ALL_MODELS, DEFAULT_MODEL_ID, findModelAny, selectableModels } from "../../prompt/models";
import { newConversation, uid } from "../../state/storePersistence";
import { skillLaunchText } from "../../skills/launch";
import { adoptDraftDebug, pushDebug } from "../../state/debug/debug";
import type { Conversation, Message } from "../../types";
import { type AutoRouteResult, isAutoModelId, resolveAutoModel } from "../autoRoute";
import { buildModelLatencyEvent } from "../modelLatency";
import type { SendMessageDeps, SendOptions } from "./types";

export type Dbg = (e: Parameters<typeof pushDebug>[0]) => string;

/** What every later phase of the send reads: the turn, its bubbles, and the ways to end it. */
export interface TurnContext {
  d: SendMessageDeps;
  text: string;
  attachments: ExtractedFile[] | undefined;
  opts: SendOptions;
  convId: string;
  conv: Conversation;
  dbg: Dbg;
  model: ModelInfo;
  provider: ProviderId;
  autoPick: AutoRouteResult | null;
  /** "Graphique" tag with an interpreter on the host: force run_python for this send. */
  forcePython: boolean;
  compPrompt: string | undefined;
  atPrompt: string | undefined;
  /** Leads the MODEL payload only (target line, plot directive, compétence); never the bubble. */
  modelPrefix: string;
  turnId: string;
  userMsg: Message;
  assistantMsg: Message;
  /** Covers Stop during the pre-model phases; the stream/tool paths replace it with their own. */
  sendAbort: AbortController;
  /** True if the user stopped before anything reached the model: resolves the bubble and says to abandon. */
  stoppedEarly: () => boolean;
  /** A refusal PATCHES the already-visible bubble pair; it never appends its own. */
  failTurn: (errorText: string, errorAction?: Message["errorAction"]) => void;
  updateAssistant: (patch: Partial<Message>) => void;
  /** Model-dispatch instant and first-token instant, shared by the agentic and plain paths. */
  latency: { t0: number; tFirst: number };
  emitModelLatency: (
    t0: number,
    tFirst: number,
    output: number,
    tools: boolean,
    toolCount: number,
    inputTokens: number,
  ) => void;
}

/**
 * Binds the send to a conversation, resolves the model (AUTO included), and shows the
 * user's bubble plus a pending assistant bubble IMMEDIATELY. Every refusal after this
 * patches that pair, so the typed message is on screen within a frame whatever happens
 * next; the bubble renders the ORIGINAL text, the wire is built from the redacted result.
 */
export function setupTurn(
  d: SendMessageDeps,
  text: string,
  attachments: ExtractedFile[] | undefined,
  opts: SendOptions,
): TurnContext {
  const { host, settings, activeId, keyConfigured, patchConversation, setIsStreaming, conversationsRef, t } = d;
  const forcePython = opts.plotTag === "graphique" && !!host.python;
  const plotPrefix = forcePython
    ? "Génère un graphique à partir des données ci-dessous en exécutant du code " +
      "Python (utilise l'outil run_python avec **seaborn/matplotlib** ; la figure s'affiche " +
      "automatiquement, pas besoin de plt.show()) :\n\n"
    : "";
  // The prefix goes through `skillLaunchText`, never the bare prompt: it adds the line
  // naming the connectors and the one for `{braces}`; without either it is the prompt as-is.
  const compPrompt = opts.competence?.prompt?.trim();
  const compPrefix = compPrompt
    ? `${skillLaunchText({ prompt: compPrompt, servers: opts.competence?.servers ?? [] })}\n\n`
    : "";
  const atPrompt = opts.askTarget?.prompt?.trim();
  const atPrefix = atPrompt ? `${atPrompt}\n\n` : "";
  const modelPrefix = atPrefix + plotPrefix + compPrefix;

  // The single point that binds the whole send to a conversation.
  const convId = (opts.convId ?? activeId) || createAndAdopt(d);
  const dbg: Dbg = (e) => pushDebug(e, convId);

  for (const f of opts.forcedRedactions ?? []) d.forceRedact(f.value, f.category, convId);

  // The LIVE list, not a captured snapshot: create-then-send in one handler leaves it
  // behind (`state/conversation/sendModelResolution.test.ts` reads this line).
  const conv = conversationsRef.current.find((c) => c.id === convId) ?? newConversation(DEFAULT_MODEL_ID);
  // AUTO mode is resolved here on every send with the same availability rule as the gate.
  const requestedModelId = opts.modelId ?? conv.modelId;
  const autoPick = isAutoModelId(requestedModelId)
    ? resolveAutoModel(
        selectableModels(d.orgProfileRef.current?.allowedModelIds),
        {
          text,
          attachmentChars: (attachments ?? []).reduce((n, a) => n + (a.chars || 0), 0),
          hasImages: !!opts.imageAttachments?.length,
          usesConnectors: !!(host.mcp && host.completeTools) && d.keepListRef.current.length > 0,
          forcesCode: opts.plotTag === "graphique",
          consultOnly: asksConsultNotAct(text),
        },
        {
          billingMode: settings.billingMode,
          keyConfigured,
          orgProfile: d.orgProfileRef.current,
          personalCredits: d.personalCreditsRef.current,
          personalSub: d.personalSubRef.current,
          openaiCompatBaseUrl: settings.openaiCompatBaseUrl,
          localEndpointReachable: d.localEndpointReachableRef.current,
          claudeCliReady: d.claudeCliReadyRef.current,
          codexCliReady: d.codexCliReadyRef.current,
          antigravityCliReady: d.antigravityCliReadyRef.current,
        },
      )
    : null;
  const model =
    autoPick?.model ??
    findModelAny(isAutoModelId(requestedModelId) ? DEFAULT_MODEL_ID : requestedModelId) ??
    ALL_MODELS[0];
  const provider = model.provider;

  const latency = { t0: 0, tFirst: 0 };
  const emitModelLatency: TurnContext["emitModelLatency"] = (t0, tFirst, output, tools, toolCount, inputTokens) => {
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

  const sentAt = Date.now();
  // A RETRY reuses the failed turn's id so write-idempotency keys match.
  const turnId = opts.resendTurnId ?? uid();
  const userMsg: Message = {
    id: uid(),
    role: "user",
    at: sentAt,
    turnId,
    // Displayed content is the clean user text; attached files show as chips.
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
    // Pin the answering model so its logo/name stay on this reply after a model switch.
    model: model.id,
    ...(autoPick ? { autoRouted: autoPick.billing } : {}),
  };

  const isFirst = conv.messages.length === 0;
  patchConversation(convId, (c) => ({
    ...c,
    title: isFirst ? text.slice(0, 48) || attachments?.[0]?.name || c.title : c.title,
    messages: [...c.messages, userMsg, assistantMsg],
    updatedAt: Date.now(),
  }));

  const updateAssistant = (patch: Partial<Message>) =>
    patchConversation(convId, (c) => ({
      ...c,
      messages: c.messages.map((m) => (m.id === assistantMsg.id ? { ...m, ...patch } : m)),
      updatedAt: Date.now(),
    }));

  // Stop works from the very first second: the pending bubble shows the button at once,
  // while the stream and tool loop only register their own cancellation much later.
  const sendAbort = new AbortController();
  d.cancelRef.current.set(convId, () => sendAbort.abort());
  const stoppedEarly = (): boolean => {
    if (!sendAbort.signal.aborted) return false;
    updateAssistant({ pending: false, error: true, errorText: t.errors.interruptedBeforeSend });
    setIsStreaming(false);
    return true;
  };

  // A pre-flight refusal is an inline failed turn with « Réessayer » (and a CTA when
  // relevant), in the same shape as the fail-closed patch and the stream `onError` path.
  const failTurn: TurnContext["failTurn"] = (errorText, errorAction) => {
    dbg({ type: "error", scope: "preflight", message: errorText });
    updateAssistant({ pending: false, error: true, errorText, ...(errorAction ? { errorAction } : {}) });
  };

  return {
    d,
    text,
    attachments,
    opts,
    convId: convId,
    conv,
    dbg,
    model,
    provider,
    autoPick,
    forcePython,
    compPrompt,
    atPrompt,
    modelPrefix,
    turnId,
    userMsg,
    assistantMsg,
    sendAbort,
    stoppedEarly,
    failTurn,
    updateAssistant,
    latency,
    emitModelLatency,
  };
}

/** The first send MATERIALISES the conversation: the draft's log entries are re-keyed to it. */
function createAndAdopt(d: SendMessageDeps): string {
  const convId = d.createConversation();
  adoptDraftDebug(convId);
  return convId;
}
