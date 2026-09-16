import { resultText, type McpToolCall } from "@openmasq/mcp";
import { captureEvent } from "../../analytics";
import { isBrowserTool } from "../../state/browserPolicy";
import { batchReadNudge, shouldNudgeBatch } from "../batchReads";
import { raceAbort } from "../mcpAgentAbort";
import { isConfidentReadOnly, isWriteTool } from "../mcpAgentClassify";
import {
  BROWSER_BACKEND_FAULT_MESSAGE,
  exhaustionMessage,
  identifierTypoHint,
  isBrowserBackendFault,
  repeatedFailureOf,
  withFailedWriteNote,
} from "../mcpAgentGuidance";
import { safeJson } from "../mcpAgentUtil";
import { toolTimeoutMs, watchToolCall } from "../mcpAgentWatchdog";
import { normalizeAction, resolveOperation } from "../operationResolver";
import { argErrorHint, unknownToolHint } from "../toolCatalog";
import { attributeToolFault, classifyErrorFamily } from "../toolFault";
import { DEAD_END_RE, MAX_CONSECUTIVE_DEAD, MAX_TURNS_HARD, STUCK_STOP, TURNS_PER_PROGRESS } from "./budget";
import type { CallDecision, CallOutcome, ConnectorCall, Step } from "./call";
import type { LoopCtx } from "./context";

/** Live-derived operation fallback: a WRITE the intent search knows no operation for is probed
 *  through the SAME redacting client (rule 11, both legs); bounded, deduped, a miss is silent. */
async function resolveOperationFallback(ctx: LoopCtx, c: ConnectorCall, out: CallOutcome): Promise<Step | "go"> {
  const { p, args, bareTool, connectorId } = { p: ctx.p, ...c };
  const wantAction = typeof args.intent === "string" ? args.intent : undefined;
  const wantResource = typeof args.resource === "string" ? args.resource : undefined;
  const na = wantAction ? normalizeAction(wantAction) : null;
  const isWrite = na === "update" || na === "create" || na === "delete";
  const writeTool = [...ctx.toolInfo.values()].find((t) => t.name.startsWith(`${connectorId}__`) && /write$/i.test(t.name));
  const fbKey = `${connectorId}|${wantResource}|${na}`;
  if (!wantResource || !isWrite || !writeTool || ctx.opResolved.has(fbKey)) return "go";
  ctx.opResolved.add(fbKey);
  const op = await raceAbort(
    resolveOperation(
      async (q) => {
        ctx.callCounts.set(c.call.name, (ctx.callCounts.get(c.call.name) ?? 0) + 1);
        const r = await watchToolCall(ctx.client.callTool({ name: c.call.name, arguments: q as McpToolCall["arguments"] }), {
          bareTool,
          timeoutMs: toolTimeoutMs(c.call.name),
        });
        const text = resultText(r.content);
        ctx.dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: c.call.name, ok: !r.isError, args: safeJson(q), result: text.slice(0, 300) });
        return text;
      },
      { resource: wantResource, action: wantAction! },
    ),
    p.signal,
  ).catch(() => null);
  if (ctx.aborted()) return ctx.finalizeAborted(), "stop";
  if (op) {
    out.content +=
      `\n\n(Opération trouvée : operationId \`${op.operationId}\` (${op.method} ${op.path}). ` +
      `Appelle \`${writeTool.name}\` avec cet operationId et les paramètres requis — n'utilise PAS l'opération de création.)`;
  }
  return "go";
}

/** Telemetry + error attribution + the hints fed back to the model. `"stop"` on a
 *  browser-backend fault (a capability failure no retry fixes). */
function attributeAndHint(ctx: LoopCtx, c: ConnectorCall, d: CallDecision, out: CallOutcome): Step | "go" {
  const { p } = ctx;
  const { call, args, server, connectorId, bareTool } = c;
  if (out.callMs !== undefined)
    captureEvent({ name: "tool_result", connector: connectorId, tool: bareTool, ok: !out.reason, ms: out.callMs, provider: p.provider, model: p.modelId, loopId: ctx.loopId });
  if (out.reason && isBrowserTool(call.name) && isBrowserBackendFault(out.toolErrRaw)) {
    captureEvent({ name: "tool_error", server, tool: call.name, reason: "browser_backend", connector: connectorId, provider: p.provider, model: p.modelId, ...(out.callMs !== undefined ? { ms: out.callMs } : {}), loopId: ctx.loopId });
    ctx.struggle.emit();
    p.onText(p.fromWire(BROWSER_BACKEND_FAULT_MESSAGE), false);
    ctx.emitUsage();
    ctx.emitLoopSummary("error", "browser_backend");
    return "stop";
  }
  // A 4xx does NOT prove the model malformed the call (`attributeToolFault`).
  if (out.reason && attributeToolFault(out.reason, ctx.toolInfo.get(call.name)?.inputSchema, args) !== out.reason) {
    out.reason = "operational";
    ctx.struggle.connectorErrored.add(call.name);
  }
  if (out.reason) {
    captureEvent({
      name: "tool_error", server, tool: call.name, reason: out.trueUnknown ? "unknown" : out.reason, connector: connectorId, provider: p.provider, model: p.modelId, loopId: ctx.loopId,
      ...(out.toolErrRaw && out.reason !== "arg_error" ? { family: classifyErrorFamily(out.toolErrRaw) } : {}),
      ...(d.missing.length ? { param: d.missing[0] } : {}),
      ...(out.reason === "arg_error" ? { attempt: (ctx.argErrorCount.get(call.name) ?? 0) + 1 } : {}),
      ...(out.callMs !== undefined ? { ms: out.callMs } : {}),
    });
    if (out.reason === "arg_error") {
      ctx.struggle.argErrored.add(call.name);
      // An INVENTED tool has no schema, so the hint would be empty: name the REAL connectors instead.
      const attempt = (ctx.argErrorCount.get(call.name) ?? 0) + 1;
      ctx.argErrorCount.set(call.name, attempt);
      const isInvented = !ctx.fullByName.has(call.name) && call.name !== "load_tools" && call.name !== "run_python" && call.name !== "suggest_integrations";
      out.content += isInvented ? unknownToolHint(ctx.fullByName) : argErrorHint(call.name, ctx.toolInfo.get(call.name)?.inputSchema, attempt);
    } else out.content += identifierTypoHint(args, ctx.seenIds);
  } else {
    ctx.struggle.succeeded.add(call.name);
  }
  return "go";
}

/** Stuck guards, keyed on (tool + exact content) over the WHOLE turn: a hint from the 2nd
 *  unproductive repeat, a hard stop at `STUCK_STOP`. Productive = NEW args AND a real result. */
function stuckGuards(ctx: LoopCtx, c: ConnectorCall, out: CallOutcome): Step | "go" {
  const { p, st } = ctx;
  const { call, args } = c;
  const tallyKey = `${call.name} ${out.content}`;
  ctx.resultTally.set(tallyKey, (ctx.resultTally.get(tallyKey) ?? 0) + 1);
  const argSig = safeJson(args);
  let argsSeen = ctx.resultArgs.get(tallyKey);
  if (!argsSeen) ctx.resultArgs.set(tallyKey, (argsSeen = new Set()));
  const newInput = !argsSeen.has(argSig);
  argsSeen.add(argSig);
  const productive = newInput && !out.reason && !DEAD_END_RE.test(out.content);
  const stuckSeen = productive ? 0 : (ctx.unproductiveTally.get(tallyKey) ?? 0) + 1;
  ctx.unproductiveTally.set(tallyKey, stuckSeen);
  if (productive) st.deadStreak = 0;
  else ctx.bumpDead();
  if (productive) st.turnBudget = Math.min(MAX_TURNS_HARD, st.turnBudget + TURNS_PER_PROGRESS);
  if (stuckSeen - 1 > (ctx.repeatedResult.get(call.name) ?? 0)) ctx.repeatedResult.set(call.name, stuckSeen - 1);
  if (out.reason && stuckSeen >= 2) st.repeatedFailure = repeatedFailureOf(call.name, out.content, argsSeen.size);
  if (stuckSeen >= STUCK_STOP) {
    ctx.messages.push({ role: "tool", toolCallId: call.id, content: out.content });
    ctx.struggle.emit();
    p.onText(
      p.fromWire(
        exhaustionMessage({
          callCounts: ctx.callCounts, repeatedResult: ctx.repeatedResult, argErrored: ctx.struggle.argErrored,
          succeeded: ctx.struggle.succeeded, maxTurns: st.turnBudget, stopped: "stuck", repeatedFailure: st.repeatedFailure,
        }),
      ),
      false,
    );
    ctx.emitUsage();
    ctx.emitLoopSummary("exhausted");
    return "stop";
  }
  if (st.deadStreak >= MAX_CONSECUTIVE_DEAD) {
    ctx.messages.push({ role: "tool", toolCallId: call.id, content: out.content });
    return ctx.finishExhausted(), "stop";
  }
  const info = ctx.toolInfo.get(call.name);
  out.content = withFailedWriteNote(out.content, call.name, !!out.reason && stuckSeen === 1 && isWriteTool(call.name, info?.description, info?.annotations));
  if (stuckSeen >= 2) {
    const siblings = [...ctx.toolInfo.values()].filter((t) => t.serverId === c.server && t.name !== call.name).map((t) => t.name).slice(0, 8);
    out.content +=
      `\n\n(Note : \`${call.name}\` a déjà renvoyé ce même résultat ${stuckSeen} fois. Ne relance PAS le même appel — ` +
      `essaie un AUTRE outil` +
      (siblings.length ? ` (appelables ici : ${siblings.map((n) => `\`${n}\``).join(", ")})` : "") +
      `, ou explique à l'utilisateur ce qui bloque. NE substitue PAS une opération différente de l'action voulue (créer ≠ mettre à jour → doublon).)`;
  }
  return "go";
}

/** The common tail of a connector call, dispatched or refused for missing args. */
export async function afterCall(ctx: LoopCtx, c: ConnectorCall, d: CallDecision, out: CallOutcome): Promise<Step> {
  const { p, st } = ctx;
  if (attributeAndHint(ctx, c, d, out) === "stop") return "stop";
  if (!out.reason && /no matching operation/i.test(out.content)) {
    if ((await resolveOperationFallback(ctx, c, out)) === "stop") return "stop";
  }
  // Give the parallel narration a brief chance to land so it can be PERSISTED on the trace.
  if (out.progressP) await raceAbort(Promise.race([out.progressP, new Promise<void>((r) => setTimeout(r, 400))]), p.signal).catch(() => {});
  p.onToolResult?.({ tool: c.bareTool, server: c.connectorId, ok: !out.reason, summary: out.reason ? undefined : out.resultSummary, note: out.progressNote, ms: out.callMs });
  if (stuckGuards(ctx, c, out) === "stop") return "stop";
  if (!out.reason && shouldNudgeBatch(st.soloRead) && isConfidentReadOnly(c.call.name, ctx.toolInfo.get(c.call.name))) {
    st.soloRead!.told = true;
    out.content += batchReadNudge(c.call.name, st.soloRead!.count);
  }
  ctx.resultEcho.record(c.connectorId, out.content);
  ctx.messages.push({ role: "tool", toolCallId: c.call.id, content: out.content });
  // Downloadable files this call returned — best-effort, never breaks the turn.
  for (const f of ctx.exportedUrls.splice(0)) {
    if (ctx.aborted()) break;
    try {
      await p.onExportedFile?.(f.url, f.mime);
    } catch {
      /* the model already saw the placeholder */
    }
  }
  return "next";
}
