import type { McpToolCall } from "@openmasq/mcp";
import { raceAbort } from "../mcpAgentAbort";
import { deredactArgs, safeJson } from "../mcpAgentUtil";
import { prefetchReads } from "../prefetch";
import { canonicalToolName } from "../toolCatalog";
import { afterCall } from "./afterCall";
import type { CallOutcome, ConnectorCall, Step, ToolCall } from "./call";
import type { ToolsResult } from "./callModel";
import type { LoopCtx } from "./context";
import { dispatchCall } from "./dispatch";
import { confirmGate, revealGate } from "./gates/confirm";
import { decideCall } from "./gates/decide";
import { precheckCall } from "./gates/precheck";
import { refusalFor } from "./gates/refusals";
import { handleWebFetchMany } from "./interceptedFetch";
import { handleLoadTools, handleMemorySearch, handleSuggestIntegrations } from "./interceptedMeta";
import { handleRunPython } from "./interceptedPython";
import { INTERCEPTED_META_TOOLS } from "./setup";

type Prefetched = Map<string, ReturnType<LoopCtx["client"]["callTool"]>>;

const DEDUP_MSG = "Appel identique au précédent dans ce même tour — dédupliqué : réutilise le résultat déjà renvoyé, ne le répète pas.";

/** This response's reads go out in parallel, in waves bounded by the context (`prefetch.ts`).
 *  A prefetched call dispatches BEFORE the sequential gates, so the clear-mode decision rides
 *  along here too — the SAME predicate as the sequential path. */
async function prefetchTurn(ctx: LoopCtx, calls: ToolCall[]): Promise<Prefetched> {
  const prefetch: Prefetched = new Map();
  if (calls.length <= 1) return prefetch;
  const { p } = ctx;
  await prefetchReads({
    calls,
    callCounts: ctx.callCounts,
    toolInfo: ctx.toolInfo,
    vaultTerms: p.vault ? [...Object.keys(p.vault), ...Object.values(p.vault)] : [],
    deredact: (args) => deredactArgs(args, p.fromWireArgs ?? p.fromWire) as Record<string, unknown>,
    budget: ctx.charBudget,
    used: ctx.usedChars,
    dispatch: (call) => {
      const pr = raceAbort(
        ctx.client.callTool(
          { id: call.id, name: call.name, arguments: call.arguments as McpToolCall["arguments"] },
          ctx.navClearOpts(call.name, (call.arguments ?? {}) as Record<string, unknown>),
        ),
        p.signal,
      );
      // A prefetch rejecting AFTER the loop returned early must not surface as unhandled.
      pr.catch(() => {});
      prefetch.set(call.id, pr);
      return pr;
    },
  });
  return prefetch;
}

/** One CONNECTOR call, through the gates then the dispatch. */
async function runConnectorCall(ctx: LoopCtx, c: ConnectorCall, prefetch: Prefetched): Promise<Step> {
  const pre = precheckCall(ctx, c);
  if (pre !== "go") return pre;
  const d = await decideCall(ctx, c);
  if (d === "aborted") return ctx.finalizeAborted(), "stop";
  const reveal = await revealGate(ctx, c, d);
  if (reveal !== "go") return reveal;
  const confirm = await confirmGate(ctx, c, d);
  if (confirm !== "go") return confirm;
  const refused = refusalFor(ctx, c, d);
  if (refused) return refused;
  const out: CallOutcome = { content: "", trueUnknown: false, toolErrRaw: "", progressP: null };
  if (d.missing.length) {
    // Definitive "the model malformed this call": a clear error, no server hit — and it
    // still goes through the common tail (attribution, hints, stuck guards).
    out.content = `Tool error: arguments requis manquants ou vides : ${d.missing.join(", ")}. Renseigne des valeurs valides puis réessaie.`;
    out.reason = "arg_error";
    ctx.dbg({ type: "tool", vault: ctx.p.vault, kinds: ctx.p.kinds, name: c.call.name, ok: false, args: safeJson(c.call.arguments), error: out.content });
  } else if ((await dispatchCall(ctx, c, d, prefetch, out)) === "stop") return "stop";
  return afterCall(ctx, c, d, out);
}

/**
 * Every tool call of one model response, in order. Names are canonicalised ONCE up front
 * (the loop keys everything on them, the prefetch included); an identical call emitted twice
 * in one response runs once (a duplicate WRITE would be a real double side effect).
 */
export async function runToolCalls(ctx: LoopCtx, res: ToolsResult, turn: number): Promise<Step> {
  const { p } = ctx;
  for (const call of res.toolCalls) {
    if (!INTERCEPTED_META_TOOLS.has(call.name)) call.name = canonicalToolName(call.name, ctx.fullByName.keys());
  }
  const prefetch = await prefetchTurn(ctx, res.toolCalls);
  const seenThisTurn = new Map<string, string>();
  for (const call of res.toolCalls) {
    // A long call still runs to completion, but no further call is issued after Stop.
    if (ctx.aborted()) return ctx.finalizeAborted(), "stop";
    const dupKey = `${call.name}::${JSON.stringify(call.arguments ?? {})}`;
    if (!call.argsError && seenThisTurn.has(dupKey)) {
      ctx.dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: call.name, ok: true, args: safeJson(call.arguments), result: "(dédupliqué)" });
      ctx.messages.push({ role: "tool", toolCallId: call.id, content: DEDUP_MSG });
      continue;
    }
    seenThisTurn.set(dupKey, call.id ?? "");
    p.onToolCall(call.name);
    ctx.loopStats.toolCalls += 1;
    const args = (call.arguments ?? {}) as Record<string, unknown>;

    // Intercepted tools never reach an MCP server.
    let step: Step;
    if (call.name === "load_tools") step = handleLoadTools(ctx, call, args);
    else if (call.name === "suggest_integrations") step = handleSuggestIntegrations(ctx, call, args);
    else if (call.name === "run_python" && p.runPython) step = await handleRunPython(ctx, call, args);
    else if (call.name === "memory_search" && p.searchMemory) step = await handleMemorySearch(ctx, call, args);
    else if (call.name === "web_fetch_many" && p.fetchMany) step = await handleWebFetchMany(ctx, call, args);
    else {
      const server = ctx.serverOf(call.name);
      const px = call.name.indexOf("__");
      step = await runConnectorCall(
        ctx,
        { call, args, turn, server, connectorId: px > 0 ? call.name.slice(0, px) : server, bareTool: px > 0 ? call.name.slice(px + 2) : call.name },
        prefetch,
      );
    }
    if (step === "stop") return "stop";
  }
  // Every tool_use of this response now has its result: a VALID boundary to checkpoint.
  ctx.checkpointTranscript();
  return "next";
}
