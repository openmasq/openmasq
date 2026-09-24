import { resultText, type McpToolCall } from "@openmasq/mcp";
import { captureEvent } from "../../analytics";
import { isBrowserWriteTool } from "../../state/browserPolicy";
import { updateDebug } from "../../state/debug/debug";
import { recordWebSearch } from "../confirmationFacts";
import { isAbortError, raceAbort } from "../mcpAgentAbort";
import { isSearchTool } from "../mcpAgentClassify";
import { opaqueIdsIn } from "../mcpAgentGuidance";
import { safeJson } from "../mcpAgentUtil";
import { ToolTimeoutError, liveToolStatus, toolTimeoutMs, watchToolCall } from "../mcpAgentWatchdog";
import { toolStartNarration } from "../toolActionLabel";
import { classifyToolError } from "../toolFault";
import { summarizeToolResult } from "../toolResultSummary";
import { INTERRUPTED_TOOL_RESULT, TIMED_OUT_WRITE_RESULT } from "../turnCheckpoint";
import type { CallDecision, CallOutcome, ConnectorCall } from "./call";
import type { LoopCtx } from "./context";

type Prefetched = Map<string, ReturnType<LoopCtx["client"]["callTool"]>>;

/** A human doesn't act the instant the page paints: a slight, interruptible pause before a
 *  browser INTERACTION (never a read). */
async function pace(ctx: LoopCtx): Promise<void> {
  const paceMs = 350 + Math.floor(Math.random() * 600);
  const sig = ctx.p.signal;
  await new Promise<void>((resolve) => {
    if (sig?.aborted) return resolve();
    const t = setTimeout(resolve, paceMs);
    sig?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

/** The model-facing text of a THROWN error. Args reach the server UN-redacted, so a server
 *  error can quote a REAL value: it is re-redacted through the SAME vault before it re-enters
 *  `messages`; an invented tool name is replaced wholesale (our own list of names). */
async function describeThrow(ctx: LoopCtx, c: ConnectorCall, d: CallDecision, err: unknown, msg: string, out: CallOutcome): Promise<void> {
  const { p } = ctx;
  if (/unknown (mcp )?tool/i.test(msg)) {
    // NOT `arg_error`: no model can call a tool that does not exist.
    out.reason = "operational";
    ctx.struggle.markUnknownTool(c.call.name);
    // A name that genuinely exists means ROUTING deprived the model of it, not that it invented it.
    if (ctx.fullByName.has(c.call.name)) {
      captureEvent({ name: "tool_route_miss", kind: "missed", offered: ctx.toolInfo.size, available: ctx.fullByName.size, connector: c.connectorId, provider: p.provider, model: p.modelId, loopId: ctx.loopId });
    }
    const siblings = [...ctx.toolInfo.keys()]
      .filter((n) => n.startsWith(`${c.connectorId}__`))
      .map((n) => n.slice(c.connectorId.length + 2))
      .slice(0, 12);
    out.content =
      `L'outil « ${c.call.name} » n'existe pas. ` +
      (siblings.length ? `Outils disponibles sur ${c.connectorId} : ${siblings.join(", ")}.` : "Appelle `load_tools` avec le nom du connecteur pour lister ses outils.");
  } else if (err instanceof ToolTimeoutError && d.idemKey) {
    // A WRITE whose watchdog fired has an UNKNOWN outcome — « délai dépassé » reads as "it
    // didn't happen" and the model re-emits the write.
    out.reason = "transport";
    out.content = TIMED_OUT_WRITE_RESULT;
  } else {
    const rawErr = `Tool error: ${msg}`;
    out.content = ctx.redactResult ? await ctx.redactResult(rawErr, p.vault, c.call.name) : "Tool error (détails masqués).";
    out.reason = classifyToolError(msg);
  }
  // `unknown → transport` serves the retry MECHANICS; telemetry keeps the truth (`trueUnknown`).
  if (out.reason === "unknown") {
    out.trueUnknown = true;
    out.reason = "transport";
  }
}

/**
 * The round-trip: un-redact args → real server → re-redact result. A pre-launched read is
 * awaited rather than redone. `raceAbort` wraps the wait so Stop releases the loop at once
 * (an MCP call has no cancel channel: late work's result is dropped). `"stop"` = the loop ended.
 */
export async function dispatchCall(ctx: LoopCtx, c: ConnectorCall, d: CallDecision, prefetch: Prefetched, out: CallOutcome): Promise<"ok" | "stop"> {
  const { p } = ctx;
  const { call, args, bareTool, connectorId } = c;
  let tCall = 0;
  let callSettled = false;
  // Hoisted so the `catch` can CLOSE the journal line — never left on « en cours… ».
  let callPhase = "";
  try {
    // Attachments were resolved and approved up front; the bytes ride a COPY so the debug
    // log and the card never carry them. Un-redaction is a no-op on base64.
    let callArgs = call.arguments as McpToolCall["arguments"];
    if (d.resolvedAttachments.length) {
      callArgs = { ...(call.arguments as Record<string, unknown>), __attachmentData: d.resolvedAttachments } as McpToolCall["arguments"];
    }
    const mcpCall: McpToolCall = { id: call.id, name: call.name, arguments: callArgs };
    callPhase = ctx.dbg({ type: "phase", scope: "tool", label: `Outil appelé · ${call.name}`, detail: "en cours…" });
    tCall = Date.now();
    // A deterministic FR narration seeds the live row at once; the LLM narration (wire args,
    // in PARALLEL, "" on failure) upgrades it and is persisted on the trace.
    out.progressNote = toolStartNarration(bareTool, connectorId, d.navHost || undefined);
    if (!ctx.aborted()) p.onToolProgress?.(out.progressNote);
    out.progressP = p.summarizeToolCall
      ? p.summarizeToolCall({ tool: bareTool, server: connectorId, args })
          .then((t) => {
            if (t) out.progressNote = t;
            if (t && !callSettled && !ctx.aborted()) p.onToolProgress?.(t);
          })
          .catch(() => {})
      : null;
    if (isBrowserWriteTool(call.name) && !prefetch.has(call.id)) {
      await pace(ctx);
      if (ctx.aborted()) return ctx.finalizeAborted(), "stop";
    }
    const hardMs = toolTimeoutMs(call.name);
    // Confirmation-policy fact, counted at DISPATCH (prefetched and sequential paths converge here).
    if (p.convId && isSearchTool(call.name)) recordWebSearch(p.convId);
    const dispatched = prefetch.has(call.id)
      ? prefetch.get(call.id)!
      : ctx.client.callTool(mcpCall, d.navClear ? ctx.navClearOpts(call.name, args) : undefined);
    // The per-call watchdog turns a HUNG tool into a `transport` error the dead-end machinery absorbs.
    const result = await raceAbort(
      watchToolCall(dispatched, {
        bareTool,
        timeoutMs: hardMs,
        onTick: (elapsed) => {
          if (!callSettled && !ctx.aborted()) p.onToolProgress?.(liveToolStatus(out.progressNote ?? "", elapsed, hardMs));
        },
      }),
      p.signal,
    );
    callSettled = true;
    out.callMs = Date.now() - tCall;
    updateDebug(callPhase, {
      label: `Outil ${result.isError ? "en échec" : "terminé"} · ${call.name}`,
      detail: result.isError ? "le connecteur a renvoyé une erreur" : "terminé",
      ok: !result.isError,
      ms: out.callMs,
    });
    out.content = resultText(result.content);
    if (result.isError) {
      out.reason = classifyToolError(out.content);
      out.toolErrRaw = out.content;
    } else {
      // The send LEFT without the attachment(s) the model asked for — never let « envoyé »
      // imply the file rode along. Names stay in WIRE form.
      if (d.unresolvedAttachmentNames.length) {
        out.content +=
          `\n\n[Pièce(s) jointe(s) demandée(s) mais INTROUVABLE(S) — parti(es) SANS : ` +
          `${d.unresolvedAttachmentNames.join(", ")}. Dis-le explicitement à l'utilisateur.]`;
      }
      out.resultSummary = summarizeToolResult(out.content);
      // Only a confirmed success enters the ledger — a failed write still retries.
      if (d.idemKey) p.onWriteDone?.(d.idemKey);
      if (ctx.seenIds.size < 500) for (const id of opaqueIdsIn(out.content)) ctx.seenIds.add(id);
    }
    ctx.dbg({
      type: "tool", vault: p.vault, kinds: p.kinds, name: call.name, ok: !result.isError,
      args: safeJson(call.arguments), result: out.content.slice(0, 600),
      // The provider's OWN explanation: journal only, it never reaches the model.
      ...(result.detail ? { error: result.detail } : {}),
    });
    return "ok";
  } catch (err) {
    callSettled = true;
    if (tCall) out.callMs = Date.now() - tCall;
    const stop = ctx.aborted() || isAbortError(err);
    updateDebug(callPhase, {
      label: `Outil ${stop ? "interrompu" : "en échec"} · ${call.name}`,
      detail: stop ? "interrompu par l'utilisateur" : "l'appel a échoué",
      ok: false,
      ...(out.callMs ? { ms: out.callMs } : {}),
    });
    // Stop during the un-cancellable dispatch: the in-flight call's outcome is UNKNOWN and the
    // transcript must SAY so, or a retry re-emits the write.
    if (stop) {
      ctx.messages.push({ role: "tool", toolCallId: call.id, content: INTERRUPTED_TOOL_RESULT });
      return ctx.finalizeAborted(), "stop";
    }
    const msg = err instanceof Error ? err.message : String(err);
    out.toolErrRaw = msg;
    await describeThrow(ctx, c, d, err, msg, out);
    ctx.dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: call.name, ok: false, args: safeJson(call.arguments), error: msg });
    return "ok";
  }
}
