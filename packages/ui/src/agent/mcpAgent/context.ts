import { contextWindow, type ToolDef } from "@openmasq/llm";
import { captureEvent, type SendErrorReason } from "../../analytics";
import { pushDebug } from "../../state/debug/debug";
import type { SoloReadStreak } from "../batchReads";
import { exhaustionMessage, type repeatedFailureOf } from "../mcpAgentGuidance";
import { isWriteTool } from "../mcpAgentClassify";
import { resultCharBudget, toolResultChars } from "../prefetch";
import { ResultEchoLedger } from "../resultEcho";
import { makeStruggleReporter, type StruggleReporter } from "../toolStruggle";
import type { LoopStats, RedactionBoundary } from "./boundary";
import { BASE_TURNS } from "./budget";
import type { LoopSetup } from "./setup";
import type { McpAgentParams } from "./types";

type GateBlockedKind = Extract<Parameters<typeof captureEvent>[0], { name: "tool_gate_blocked" }>["kind"];
type LoopOutcome = "answered" | "exhausted" | "aborted" | "error";

/** The scalars the loop mutates as it runs. */
interface LoopState {
  currentTurn: number;
  turnBudget: number;
  /** Consecutive non-productive RESPONSES; `deadTurn` = response index of the last count. */
  deadStreak: number;
  deadTurn: number;
  pyTimeoutStreak: number;
  budgetNotedTurn: number;
  lastText: string;
  anyToolCall: boolean;
  forcedRetryDone: boolean;
  emptyRetryDone: boolean;
  stallRetryDone: boolean;
  /** A SOFT model call failed for a reason other than an abort. */
  softCallFailed: boolean;
  summaryEmitted: boolean;
  webNavAsked: boolean;
  /** The model proposed integrations itself — its pick wins over ours. */
  suggested: boolean;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  modelTurns: number;
  loggedMsgCount: number;
  soloRead: SoloReadStreak | null;
  repeatedFailure?: ReturnType<typeof repeatedFailureOf>;
}

/** Everything a step of the loop needs: the params, the offer, the boundary, the counters
 *  and the exits. Built once per run by `createLoopCtx`. */
export interface LoopCtx extends LoopSetup, RedactionBoundary {
  p: McpAgentParams;
  loopId: string;
  st: LoopState;
  loopStats: LoopStats;
  dbg: (e: Parameters<typeof pushDebug>[0]) => string;
  struggle: StruggleReporter;
  serverOf: (tool: string) => string;
  argErrorCount: Map<string, number>;
  callCounts: Map<string, number>;
  capNotedTurn: Map<string, number>;
  charBudget: number;
  usedChars: () => number;
  resultEcho: ResultEchoLedger;
  resultTally: Map<string, number>;
  resultArgs: Map<string, Set<string>>;
  unproductiveTally: Map<string, number>;
  repeatedResult: Map<string, number>;
  opResolved: Set<string>;
  seenIds: Set<string>;
  aborted: () => boolean;
  /** Persists the turn's real state, finalizes the bubble, emits usage + summary. */
  finalizeAborted: () => true;
  /** Early stop with the exhaustion diagnosis; the caller pushes the current tool message first. */
  finishExhausted: (hammered?: { tool: string; web: boolean }) => true;
  checkpointTranscript: () => void;
  emitUsage: () => void;
  /** ONE summary per run; the FIRST outcome wins. */
  emitLoopSummary: (outcome: LoopOutcome, reason?: SendErrorReason | "browser_backend") => void;
  /** Counts a dead outcome at most ONCE per model response. */
  bumpDead: () => number;
  gateBlocked: (kind: GateBlockedKind, tool: string, connector: string) => void;
  /** Tools WITHOUT side effects — the only ones a FORCED recall may choose from. */
  readOnlyToolDefs: () => ToolDef[];
}

export function createLoopCtx(
  p: McpAgentParams,
  setup: LoopSetup,
  boundary: RedactionBoundary,
  loopId: string,
  loopStats: LoopStats,
): LoopCtx {
  const loopT0 = Date.now();
  const st: LoopState = {
    currentTurn: 0, turnBudget: BASE_TURNS, deadStreak: 0, deadTurn: -1, pyTimeoutStreak: 0,
    budgetNotedTurn: -1, lastText: "", anyToolCall: false, forcedRetryDone: false,
    emptyRetryDone: false, stallRetryDone: false, softCallFailed: false, summaryEmitted: false,
    webNavAsked: false, suggested: false, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0,
    cacheWriteInputTokens: 0, modelTurns: 0, loggedMsgCount: 0, soloRead: null,
  };
  const serverOf = (tool: string) => setup.toolInfo.get(tool)?.serverId ?? "mcp";
  const struggle = makeStruggleReporter({ serverOf, onToolStruggle: p.onToolStruggle, provider: p.provider, modelId: p.modelId, loopId });
  const callCounts = new Map<string, number>();
  const repeatedResult = new Map<string, number>();
  const checkpointTranscript = () =>
    p.onResumeTranscript?.([...setup.priorTranscript, ...setup.messages.slice(setup.baseLen)]);
  const emitUsage = () => {
    if (st.inputTokens || st.outputTokens)
      p.onUsage?.({
        inputTokens: st.inputTokens,
        outputTokens: st.outputTokens,
        ...(st.cachedInputTokens ? { cachedInputTokens: st.cachedInputTokens } : {}),
        ...(st.cacheWriteInputTokens ? { cacheWriteInputTokens: st.cacheWriteInputTokens } : {}),
        toolCount: setup.mcpTools.length,
        modelTurns: st.modelTurns,
      });
  };
  const emitLoopSummary: LoopCtx["emitLoopSummary"] = (outcome, reason) => {
    if (st.summaryEmitted) return;
    st.summaryEmitted = true;
    captureEvent({
      name: "tool_loop_summary",
      provider: p.provider, model: p.modelId, loopId,
      turns: st.currentTurn + 1, toolCalls: loopStats.toolCalls, ms: Date.now() - loopT0,
      routerOffered: setup.selected.length, routerTotal: setup.mcpTools.length,
      loadToolsUnknown: loopStats.loadToolsUnknown,
      navClear: loopStats.navClear, navEscalated: loopStats.navEscalated,
      outcome,
      ...(reason ? { reason } : {}),
    });
  };
  const dbg: LoopCtx["dbg"] = (e) => pushDebug(e, p.convId);
  const finalizeAborted = (): true => {
    // A Stop can land mid-batch with a dispatched call whose outcome is unknown; without
    // this checkpoint the retry replays a transcript where the call "never happened".
    checkpointTranscript();
    dbg({ type: "phase", scope: "system", label: "Interrompu par l'utilisateur", ok: false });
    p.onText(st.lastText || p.fromWire("_(Interrompu.)_"), false);
    emitUsage();
    emitLoopSummary("aborted");
    return true;
  };
  const finishExhausted = (hammered?: { tool: string; web: boolean }): true => {
    checkpointTranscript();
    struggle.emit();
    p.onText(
      p.fromWire(
        exhaustionMessage({
          callCounts, repeatedResult, argErrored: struggle.argErrored, succeeded: struggle.succeeded,
          maxTurns: st.turnBudget, stopped: "stuck", hammered, repeatedFailure: st.repeatedFailure,
        }),
      ),
      false,
    );
    emitUsage();
    emitLoopSummary("exhausted");
    return true;
  };
  return {
    ...setup,
    ...boundary,
    p, loopId, st, loopStats, dbg, struggle, serverOf,
    argErrorCount: new Map(), callCounts, capNotedTurn: new Map(),
    charBudget: resultCharBudget(contextWindow(p.modelId)),
    usedChars: () => toolResultChars(setup.messages),
    resultEcho: new ResultEchoLedger(),
    resultTally: new Map(), resultArgs: new Map(), unproductiveTally: new Map(), repeatedResult,
    opResolved: new Set(), seenIds: new Set(),
    aborted: () => p.signal?.aborted === true,
    finalizeAborted, finishExhausted, checkpointTranscript, emitUsage, emitLoopSummary,
    bumpDead: () => (st.deadTurn === st.currentTurn ? st.deadStreak : ((st.deadTurn = st.currentTurn), ++st.deadStreak)),
    gateBlocked: (kind, tool, connector) =>
      captureEvent({ name: "tool_gate_blocked", kind, tool, connector, provider: p.provider, model: p.modelId, loopId }),
    readOnlyToolDefs: () =>
      setup.toolDefs.filter((d) => {
        const info = setup.toolInfo.get(d.name);
        return !isWriteTool(d.name, info?.description, info?.annotations);
      }),
  };
}
