import type { Host } from "../../host";
import { sendErrorReason } from "../../state/errors";
import { isDebugCapture, updateDebug } from "../../state/debug/debug";
import { isAbortError } from "../mcpAgentAbort";
import { compactToolHistory } from "../mcpAgentUtil";
import { turnRequestDelta, turnRequestFull, turnToolCall, turnToolNames } from "../turnDebug";
import { COMPLETE_TOOLS_TIMEOUT_MS, MODEL_STALL_ERROR, STREAM_FLUSH_MS, TTFT_WATCHDOG_MS } from "./budget";
import type { LoopCtx } from "./context";

export type ToolsResult = Awaited<ReturnType<NonNullable<Host["completeTools"]>>>;
type Payload = Parameters<NonNullable<Host["completeTools"]>>[0];

/** Streamed turn: text arrives token by token (coalesced), tool calls are assembled on done.
 *  A TTFT watchdog turns a model stuck in prefill into `MODEL_STALL`; Stop rejects at once. */
function streamTurn(ctx: LoopCtx, payload: Payload, counters: { chars: number; argsChars: number }): Promise<ToolsResult> {
  const { p } = ctx;
  const streamTools = p.host.streamChatTools!;
  return new Promise<ToolsResult>((resolve, reject) => {
    let acc = "";
    let cancel = () => {};
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    let flushedLen = -1;
    const clearFlush = () => {
      if (flushTimer !== undefined) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
      }
    };
    const flush = () => {
      flushTimer = undefined;
      if (acc.length === flushedLen) return;
      flushedLen = acc.length;
      ctx.st.lastText = p.fromWire(acc);
      p.onText(ctx.st.lastText, true);
    };
    let watchdog: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      watchdog = undefined;
      cancel();
      reject(new Error(MODEL_STALL_ERROR));
    }, TTFT_WATCHDOG_MS);
    const clearWatchdog = () => {
      if (watchdog) {
        clearTimeout(watchdog);
        watchdog = undefined;
      }
    };
    // First sign of generation (prose, a tool-call argument OR reasoning) clears the watchdog
    // and marks TTFT once — a tool-first turn is measured too.
    let firstSeen = false;
    const markFirst = () => {
      if (firstSeen) return;
      firstSeen = true;
      clearWatchdog();
      p.onFirstToken?.();
    };
    const onAbort = () => {
      clearWatchdog();
      clearFlush();
      cancel();
      reject(new DOMException("Aborted", "AbortError"));
    };
    p.signal?.addEventListener("abort", onAbort, { once: true });
    const settle = (fn: () => void) => {
      clearWatchdog();
      clearFlush();
      p.signal?.removeEventListener("abort", onAbort);
      fn();
    };
    cancel = streamTools(payload, {
      onChunk: (d) => {
        markFirst();
        acc += d;
        counters.chars = acc.length;
        // The final exact text is set from `res.text` after resolution, so a skipped flush is safe.
        if (flushTimer === undefined) flushTimer = setTimeout(flush, STREAM_FLUSH_MS);
      },
      onToolArgs: (n, name) => {
        markFirst();
        counters.argsChars = n;
        p.onToolArgs?.(n, name);
      },
      onReasoning: (d) => {
        markFirst();
        p.onReasoning?.(d);
      },
      onDone: (result) => settle(() => resolve(result)),
      onError: (msg) => settle(() => reject(new Error(msg))),
    });
  });
}

/** Non-streamed turn: no first-token signal, so a hard budget turns a hung provider into a stall. */
async function completeTurn(ctx: LoopCtx, payload: Payload): Promise<ToolsResult> {
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      ctx.p.host.completeTools!(payload),
      new Promise<never>((_, rej) => {
        stallTimer = setTimeout(() => rej(new Error(MODEL_STALL_ERROR)), COMPLETE_TOOLS_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
  }
}

/**
 * One model call for the current turn. `forceTool` sends tool_choice=required over the
 * READ-ONLY tools only (a forced recall may look things up, never act). Returns `null` when
 * aborted. `soft` = an opportunistic call whose failure must not fail the turn: it sets
 * `softCallFailed` and returns null instead of throwing.
 */
export async function callModel(ctx: LoopCtx, forceTool: boolean, soft = false): Promise<ToolsResult | null> {
  const { p, st, messages, toolDefs, dbg } = ctx;
  const streaming = !!p.host.streamChatTools;
  const payload: Payload = {
    provider: p.provider,
    model: p.modelId,
    // Compacted for THIS call only (old tool results truncated); `messages` stays intact.
    messages: compactToolHistory(messages),
    tools: forceTool ? ctx.readOnlyToolDefs() : toolDefs,
    apiKey: p.apiKey,
    baseUrl: p.baseUrl,
    requestId: p.requestId,
    ...(forceTool ? { toolChoice: "required" as const } : {}),
  };
  // The climbing clock is what tells a long wait apart from a frozen UI.
  const t0 = Date.now();
  const phaseId = dbg({
    type: "phase",
    scope: "model",
    label: `Appel modèle · tour ${st.currentTurn + 1}${forceTool ? " · forcé" : ""}`,
    detail: streaming ? "streaming…" : "non-streamé…",
  });
  const counters = { chars: 0, argsChars: 0 };
  const tick = setInterval(() => {
    const parts: string[] = [];
    if (counters.chars) parts.push(`${counters.chars} car. texte`);
    if (counters.argsChars) parts.push(`${counters.argsChars} car. args`);
    updateDebug(phaseId, {
      detail: `${streaming ? "streaming" : "en cours"}… ${Math.round((Date.now() - t0) / 1000)}s${parts.length ? ` · ${parts.join(" · ")}` : ""}`,
    });
  }, 1000);
  try {
    let r: ToolsResult;
    if (streaming) r = await streamTurn(ctx, payload, counters);
    else {
      r = await completeTurn(ctx, payload);
      p.onFirstToken?.();
    }
    st.modelTurns += 1;
    if (r.usage) {
      st.inputTokens += r.usage.inputTokens;
      st.outputTokens += r.usage.outputTokens;
      st.cachedInputTokens += r.usage.cachedInputTokens ?? 0;
      st.cacheWriteInputTokens += r.usage.cacheWriteInputTokens ?? 0;
    }
    const n = r.toolCalls.length;
    updateDebug(phaseId, {
      label: `Réponse modèle · tour ${st.currentTurn + 1}`,
      ok: true,
      ms: Date.now() - t0,
      detail: n
        ? `${n} appel${n > 1 ? "s" : ""} d'outil${r.text.trim() ? ` · ${r.text.length} car. de texte` : ""}`
        : `${r.text.length} car. de texte`,
    });
    // Journal « échanges »: the DELTA this turn appended + the raw response, wire form.
    if (isDebugCapture()) {
      dbg({
        type: "turn", model: p.modelId, turn: st.currentTurn + 1, ok: true,
        request: turnRequestDelta(messages, st.loggedMsgCount), msgCount: messages.length,
        toolsOffered: toolDefs.length, toolNames: turnToolNames(toolDefs),
        toolChoice: forceTool ? "required" : "auto",
        text: r.text, toolCalls: r.toolCalls.map(turnToolCall), stopReason: r.stopReason,
        inputTokens: r.usage?.inputTokens, outputTokens: r.usage?.outputTokens,
        cachedInputTokens: r.usage?.cachedInputTokens,
        ms: Date.now() - t0, vault: p.vault, kinds: p.kinds,
      });
      st.loggedMsgCount = messages.length;
    }
    return r;
  } catch (err) {
    if (ctx.aborted() || isAbortError(err)) {
      updateDebug(phaseId, { label: `Appel modèle interrompu · tour ${st.currentTurn + 1}`, detail: "interrompu par l'utilisateur", ok: false, ms: Date.now() - t0 });
      return null;
    }
    updateDebug(phaseId, {
      label: `Échec appel modèle · tour ${st.currentTurn + 1}`,
      ok: false,
      ms: Date.now() - t0,
      detail: err instanceof Error ? err.message : String(err),
    });
    // Failure dump: the COMPLETE request, enough to diagnose a provider 400 from the journal.
    if (isDebugCapture()) {
      dbg({
        type: "turn", model: p.modelId, turn: st.currentTurn + 1, ok: false,
        request: turnRequestFull(messages), requestFull: true, msgCount: messages.length,
        toolsOffered: toolDefs.length, toolNames: turnToolNames(toolDefs),
        toolChoice: forceTool ? "required" : "auto",
        ms: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
        vault: p.vault, kinds: p.kinds,
      });
    }
    if (soft) {
      st.softCallFailed = true;
      return null;
    }
    ctx.emitLoopSummary("error", sendErrorReason(err));
    throw err;
  } finally {
    clearInterval(tick);
  }
}
