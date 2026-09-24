import type { ChatMessage } from "@openmasq/llm";
import { runMcpAgentLoop } from "../../agent/mcpAgent";
import { toolActionLabel } from "../../agent/toolActionLabel";
import { rememberTranscript, resumeMessagesFor, type TurnCheckpoint } from "../../agent/turnCheckpoint";
import { captureEvent } from "../../analytics";
import { filterNotoriousFromForced, memoryForcedAll, searchMemoryHybrid } from "../../memory";
import { skillLaunchScopeOf } from "./skillScope";
import { isBrowserTool } from "../../state/browserPolicy";
import { reasoningRelay } from "../../state/conversation/reasoningRelay";
import { updateDebug } from "../../state/debug/debug";
import { uid } from "../../state/storePersistence";
import { makeRedactToolResult } from "../toolResult";
import { combinedVaultTerms } from "../vaultTerms";
import { commitTurnVault, failAgentTurn } from "./agentFailure";
import { makeOnExportedFile, makeResolveAttachments } from "./agentFiles";
import { makeConfirmWebNav, makeRewireWire, makeSummarizeToolCall } from "./agentGates";
import { makePythonCallbacks } from "./agentPython";
import type { Routing } from "./platformGate";
import type { RedactedTurn } from "./redactionPasses";
import type { RedactionSetup } from "./redactionSetup";
import type { TurnContext } from "./turnSetup";
import { toolForcedList } from "../redactionOptions";

/** Bounds the per-conversation write ledger (writes are confirm-gated, so rare). */
const LEDGER_CAP = 200;

/**
 * The agentic path: the model calls connector tools. Every argument is un-redacted just
 * before the real server and every result re-redacted into the vault, so the model only
 * ever sees fakes. Returns true when the turn is over (handled, stopped or failed) and
 * false when the loop declined it, in which case the plain stream takes over.
 */
export async function runAgentTurn(
  ctx: TurnContext,
  r: RedactionSetup,
  red: RedactedTurn,
  routing: Routing,
  history: ChatMessage[],
): Promise<boolean> {
  const { d, conv, opts, convId, model, provider, turnId, latency, updateAssistant } = ctx;
  const { host, settings } = d;
  const notoriety = { commercial: r.commercialNotoriety, people: r.peopleNotoriety };
  // Per-value categories learned from TOOL RESULTS, persisted after the loop for their colour.
  const toolKinds: Record<string, string> = {};
  const redactToolResult = makeRedactToolResult({
    useRemote: false,
    useAiDetect: r.useAiDetect,
    useModel: false,
    useLocal: r.useLocal,
    settings,
    host,
    extraSecrets: r.extraSecrets,
    // The Coffre UNFILTERED: a value the user never typed but that surfaces in a result
    // must still be redacted (`send/toolResult.test.ts`, coffre-in-tool-result).
    forced: toolForcedList(combinedVaultTerms(settings), conv),
    memorySearchForced: filterNotoriousFromForced(memoryForcedAll(settings.memoire), notoriety),
    // `turnKinds`, not `convKinds`: on a first message only it knows this send's fresh spans.
    engine: { ...r.engineCtx, kinds: red.turnKinds },
    wireUserTexts: history.filter((m) => m.role === "user").map((m) => m.content),
    completeFn: r.completeFn,
    detectLocalFn: r.detectLocalFn,
    toolKinds,
    convId,
  });

  const toolRequestId = uid();
  const toolController = new AbortController();
  let agentUsageReported = false;
  d.cancelRef.current.set(convId, () => {
    toolController.abort();
    host.cancelTools?.(toolRequestId);
  });
  d.finishRef.current.delete(convId); // the loop finalises itself on abort
  latency.t0 = Date.now();
  latency.tFirst = 0;
  // Outside the try so the catch can seal it too.
  const agentReasoning = reasoningRelay(r.fromWire, (t) => updateAssistant({ reasoning: t }));
  // Retry-safety: a side-effecting call that already SUCCEEDED in the failed attempt is not
  // repeated. Keys are hashes of redacted args (no PII), so they ride the normal persistence.
  const completedWrites = new Set<string>(conv.writeLedger ?? []);
  const py = makePythonCallbacks(ctx, r);
  const baseUrl = routing.effectivePlatform
    ? routing.platformBaseUrl
    : provider === "openai-compat"
      ? settings.openaiCompatBaseUrl
      : undefined;
  const failure = (err: unknown) =>
    failAgentTurn(ctx, r, routing, {
      err,
      aborted: toolController.signal.aborted,
      usageReported: agentUsageReported,
      toolKinds,
      history,
    });

  try {
    const handled = await runMcpAgentLoop({
      host,
      provider,
      modelId: model.id,
      confirmWebNav: makeConfirmWebNav(ctx, r),
      rewireWire: makeRewireWire(ctx, r, red),
      // The mémoire lookup, REAL-valued and local; the loop owns both redaction halves.
      // Never offered when the conversation is "sans mémoire": the switch cuts both directions.
      searchMemory:
        !conv.memoryOff && settings.memoire && (settings.memoire.profile?.trim() || settings.memoire.cards.length)
          ? (q: string) =>
              searchMemoryHybrid(
                settings.memoire,
                q,
                host.memoryIndex?.query ? (t, k) => host.memoryIndex!.query!(t, k) : undefined,
              )
          : undefined,
      summarizeToolCall: makeSummarizeToolCall(ctx, r, routing),
      onToolProgress: (text) => updateAssistant({ toolStatus: text }),
      signal: toolController.signal,
      requestId: toolRequestId,
      convId,
      turnId,
      writeLedgerHas: (key) => completedWrites.has(key),
      onWriteDone: (key) => {
        if (completedWrites.has(key)) return;
        completedWrites.add(key);
        d.patchConversation(convId, (c) => {
          const next = [...(c.writeLedger ?? []), key];
          return { ...c, writeLedger: next.length > LEDGER_CAP ? next.slice(next.length - LEDGER_CAP) : next };
        });
      },
      // Resume: RAM covers a retry in-session, the encrypted checkpoint a crash mid-turn,
      // replayed with every unanswered tool call SEALED as interrupted.
      resumeTranscript: resumeMessagesFor(
        d.resumeTranscriptsRef.current,
        conv.turnCheckpoint as TurnCheckpoint | undefined,
        turnId,
        Date.now(),
      ),
      onResumeTranscript: (t) => {
        const cp = rememberTranscript(d.resumeTranscriptsRef.current, turnId, t, Date.now());
        d.patchConversation(convId, (c) => ({ ...c, turnCheckpoint: cp }));
      },
      // The key is injected in main, EXCEPT platform models which carry the session token.
      apiKey: routing.effectivePlatform ? routing.platformToken : undefined,
      baseUrl,
      history,
      vault: r.vault,
      // The FULL Coffre: the loop's browser redaction escalates on any Coffre value a page shows.
      secrets: [...r.extraSecrets, ...(settings.coffre ?? []).map((t) => t.value.trim()).filter(Boolean)],
      disabledKinds: r.disabledKinds,
      connectorMasking: settings.connectorMasking,
      structuralUrlHosts: r.engineCtx.structuralUrlHosts,
      allowedServerIds: d.orgProfileRef.current?.allowedMcpIds,
      browserReadOnly: settings.browserReadOnly,
      browserAllowedDomains: settings.browserAllowedDomains,
      scopedConnectors: skillLaunchScopeOf(opts, conv),
      routingConfig: opts.routingConfig,
      // The built-in browser exists: never steer the user to a paid search connector.
      browserEnableable: !!host.mcp?.enableBrowser,
      redactResult: redactToolResult,
      kinds: red.turnKinds,
      confirmWrite: opts.confirmToolWrite ? (info) => opts.confirmToolWrite!(info, convId) : undefined,
      resolveAttachments: makeResolveAttachments(ctx),
      runPython: py.runPython,
      fetchMany: host.web ? (urls) => host.web!.fetchMany(urls) : undefined,
      onPythonImage: py.onPythonImage,
      onPythonScript: py.onPythonScript,
      onPythonFile: py.onPythonFile,
      fromWire: r.fromWire,
      fromWireArgs: r.fromWireArgs,
      // The first sign of generation, prose OR a streamed tool-call argument: TTFT for a tool-first turn too.
      onFirstToken: () => {
        if (!latency.tFirst) latency.tFirst = Date.now();
      },
      onToolArgs: (chars, name) => updateAssistant({ toolStatus: toolActionLabel(name, chars) }),
      onReasoning: agentReasoning.push,
      onText: (content, pending) => {
        if (!latency.tFirst && content) latency.tFirst = Date.now();
        updateAssistant({ content, pending, toolCall: undefined, toolStatus: undefined });
      },
      onToolCall: (name) => {
        if (name && isBrowserTool(name)) d.setBrowserActivity((n) => n + 1);
        updateAssistant({ toolCall: name ?? undefined, toolStatus: undefined, pending: true });
      },
      // The vault rides along INCREMENTALLY with each persisted tool call: the assistant
      // text is stored un-redacted, so an uncommitted vault would replay real values in
      // clear on the next send. Snapshot-spread, never the live reference.
      onToolResult: (entry) =>
        d.patchConversation(convId, (c) => ({
          ...c,
          redactionVault: { ...r.vault },
          redactionSalt: r.redactionSalt,
          redactionKey: r.redactionKey,
          redactionMode: r.redactionMode,
          redactionKinds: { ...c.redactionKinds, ...toolKinds },
          messages: c.messages.map((m) =>
            m.id === ctx.assistantMsg.id ? { ...m, toolCalls: [...(m.toolCalls ?? []), entry] } : m,
          ),
          updatedAt: Date.now(),
        })),
      onQuotaLeft: (quotaLeft) => updateAssistant({ quotaLeft }),
      onUsage: (usage) => {
        agentUsageReported = true;
        updateAssistant({
          usage: {
            model: model.id,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            billed: routing.effectivePlatform ? "subscription" : "byo",
          },
        });
        // COUNTS only: the cache shares are what make extending the caching arbitrable.
        captureEvent({
          name: "token_usage",
          provider,
          model: model.id,
          input: usage.inputTokens,
          output: usage.outputTokens,
          ...(usage.cachedInputTokens ? { cached: usage.cachedInputTokens } : {}),
          ...(usage.cacheWriteInputTokens ? { cacheWrite: usage.cacheWriteInputTokens } : {}),
        });
        ctx.emitModelLatency(latency.t0, latency.tFirst, usage.outputTokens, true, usage.toolCount, usage.inputTokens);
        updateDebug(red.wireDebugId, {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cachedInputTokens: usage.cachedInputTokens,
          modelTurns: usage.modelTurns,
        });
      },
      onToolStruggle: ({ server, tool, kind }) => updateAssistant({ toolStruggle: { server, tool, kind, model: model.id } }),
      onSuggestIntegrations: (ids) => updateAssistant({ suggestedIntegrations: ids }),
      onExportedFile: makeOnExportedFile(ctx, r),
    });
    agentReasoning.done();
    if (!handled) return false;
    d.cancelRef.current.delete(convId);
    d.finishRef.current.delete(convId);
    // A mid-turn Stop also returns `handled`: the turn is NOT settled, so the durable
    // checkpoint must survive for the retry to see its calls sealed as interrupted.
    const settled = !toolController.signal.aborted;
    commitTurnVault(ctx, r, toolKinds, (c) => ({ turnCheckpoint: settled ? undefined : c.turnCheckpoint }));
    d.setIsStreaming(false);
    return true;
  } catch (err) {
    agentReasoning.done();
    failure(err);
    return true;
  }
}
