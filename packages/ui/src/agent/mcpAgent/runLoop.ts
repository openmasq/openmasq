import { advanceSoloRead } from "../batchReads";
import { connectorsForRequest, missingConnectorMessage } from "../integrationMatch";
import { exhaustionMessage, looksLikeRefusal } from "../mcpAgentGuidance";
import { namesConnectedConnector } from "../mcpAgentOutcome";
import { MAX_SUGGESTIONS } from "../suggestIntegrations";
import { makeRedactionBoundary } from "./boundary";
import { MODEL_STALL_ERROR } from "./budget";
import { callModel, type ToolsResult } from "./callModel";
import { createLoopCtx, type LoopCtx } from "./context";
import { buildLoopSetup } from "./setup";
import { runToolCalls } from "./turn";
import type { McpAgentParams } from "./types";

/** A model turn with its retries. `null` = aborted (the caller finalizes the bubble). */
async function modelTurn(ctx: LoopCtx): Promise<ToolsResult | null> {
  const { st } = ctx;
  let res: ToolsResult | null;
  try {
    res = await callModel(ctx, false);
  } catch (err) {
    // A STALL gets ONE soft retry; a retry that fails re-throws the ORIGINAL stall.
    const stalled = err instanceof Error && err.message === MODEL_STALL_ERROR;
    if (!stalled || st.stallRetryDone) throw err;
    st.stallRetryDone = true;
    st.softCallFailed = false;
    const retry = await callModel(ctx, false, true);
    if (!retry) {
      if (!st.softCallFailed) return null;
      throw err;
    }
    res = retry;
  }
  if (!res) return null;
  // ONE retry on a completely EMPTY turn (no text, no tool call).
  if (res.toolCalls.length === 0 && !st.emptyRetryDone && !res.text.trim()) {
    st.emptyRetryDone = true;
    st.softCallFailed = false;
    const retry = await callModel(ctx, false, true);
    if (retry) res = retry;
    else if (!st.softCallFailed) return null;
  }
  // ONE FORCED retry (read-only tools) when the model declined in prose or FABRICATED an
  // answer about a connector it never called — opportunistic: a rejected forced call keeps
  // the prose answer.
  if (res.toolCalls.length === 0) {
    const fabricated = namesConnectedConnector(ctx.requestText, ctx.connectedIds);
    if (!st.anyToolCall && !st.forcedRetryDone && (looksLikeRefusal(res.text) || fabricated) && ctx.readOnlyToolDefs().length) {
      st.forcedRetryDone = true;
      st.softCallFailed = false;
      const retry = await callModel(ctx, true, true);
      if (retry) res = retry;
      else if (!st.softCallFailed) return null;
    }
  }
  return res;
}

/** The final answer: struggle hints, our own integration cards, never a blank bubble. */
function finishAnswered(ctx: LoopCtx, res: ToolsResult): true {
  const { p, st } = ctx;
  ctx.struggle.emit();
  if (!st.anyToolCall && (looksLikeRefusal(res.text) || namesConnectedConnector(ctx.requestText, ctx.connectedIds))) ctx.struggle.reportNoToolUsed();
  // A weak model never calls `suggest_integrations`: propose the named-but-missing service ourselves.
  if (!st.suggested && ctx.suggestCandidates.length) {
    const wanted = connectorsForRequest(ctx.requestText, ctx.suggestCandidates, ctx.alreadyConnected);
    if (wanted.length) p.onSuggestIntegrations?.(wanted.map((c) => c.id));
  }
  const finalText = res.text.trim()
    ? p.fromWire(res.text)
    : p.fromWire("_(Le modèle n'a renvoyé aucune réponse. Réessayez ou changez de modèle.)_");
  p.onText(finalText, false);
  ctx.emitUsage();
  ctx.emitLoopSummary("answered");
  return true;
}

/**
 * Run the agentic MCP loop: the model calls connector tools with every argument un-redacted
 * before the real server and every result re-redacted into the vault before the model sees
 * it. Returns `false` when there is nothing to run (the caller streams plainly).
 */
export async function runMcpAgentLoop(p: McpAgentParams): Promise<boolean> {
  if (!p.host.mcp || !p.host.completeTools) return false;
  const loopId = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const loopStats = { toolCalls: 0, loadToolsUnknown: 0, navClear: 0, navEscalated: 0 };
  const boundary = makeRedactionBoundary(p, loopStats);
  const setup = await buildLoopSetup(p, boundary, loopId);
  if (!setup) return false;
  const ctx = createLoopCtx(p, setup, boundary, loopId, loopStats);
  const { st, messages } = ctx;

  // Stop may have been clicked during ROUTING: answer nothing the user just cancelled.
  if (ctx.aborted()) return ctx.finalizeAborted();
  // A workflow's declared-but-missing connectors are known BEFORE the first model call.
  if (setup.scope.missing.length) {
    st.suggested = true;
    p.onSuggestIntegrations?.(setup.scope.missing.slice(0, MAX_SUGGESTIONS));
    if (setup.scope.unusable) {
      p.onText(p.fromWire(missingConnectorMessage(setup.scope.missing)), false);
      ctx.emitUsage();
      ctx.emitLoopSummary("error");
      return true;
    }
  }
  const internal = setup.toolDefs.length - setup.selected.length;
  ctx.dbg({
    type: "phase", scope: "loop", label: "Boucle MCP démarrée",
    detail:
      `${setup.selected.length}/${setup.mcpTools.length} outil${setup.mcpTools.length > 1 ? "s" : ""} connecteur` +
      `${internal ? ` + ${internal} interne${internal > 1 ? "s" : ""}` : ""}` +
      ` = ${setup.toolDefs.length} offert${setup.toolDefs.length > 1 ? "s" : ""} · ${p.modelId}`,
  });
  // The budget is re-read each iteration: a productive turn extends the run.
  for (let turn = 0; turn < st.turnBudget; turn++) {
    st.currentTurn = turn;
    if (ctx.aborted()) return ctx.finalizeAborted();
    const res = await modelTurn(ctx);
    if (!res) return ctx.finalizeAborted();
    if (res.toolCalls.length === 0) return finishAnswered(ctx, res);
    st.anyToolCall = true;
    if (res.rateLimit) p.onQuotaLeft?.(res.rateLimit);
    st.soloRead = advanceSoloRead(st.soloRead, res.toolCalls);
    messages.push({ role: "assistant", content: res.text, toolCalls: res.toolCalls });
    if (res.text.trim()) {
      st.lastText = p.fromWire(res.text);
      p.onText(st.lastText, true);
    }
    if ((await runToolCalls(ctx, res, turn)) === "stop") return true;
  }
  // The turn cap without a final answer: an explicit diagnosis, names only.
  ctx.struggle.emit();
  p.onText(
    p.fromWire(
      exhaustionMessage({
        callCounts: ctx.callCounts, repeatedResult: ctx.repeatedResult, argErrored: ctx.struggle.argErrored,
        succeeded: ctx.struggle.succeeded, maxTurns: st.turnBudget,
      }),
    ),
    false,
  );
  ctx.emitUsage();
  ctx.emitLoopSummary("exhausted");
  return true;
}
