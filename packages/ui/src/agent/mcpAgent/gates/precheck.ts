import { captureEvent } from "../../../analytics";
import { isConfidentReadOnly, isGovernedWebTool, maxSameToolCalls } from "../../mcpAgentClassify";
import { safeJson } from "../../mcpAgentUtil";
import { contextBudgetNote } from "../../prefetch";
import { schemaBlindProblems } from "../../schemaBlind";
import { argErrorHint, toolDefOf } from "../../toolCatalog";
import { capRefusalNote } from "../../mcpAgentGuidance";
import { MAX_CONSECUTIVE_DEAD } from "../budget";
import type { ConnectorCall, Step } from "../call";
import type { LoopCtx } from "../context";

/** Pushes an arg-error result the server never saw, and counts it toward the dead streak. */
function bounceArgError(ctx: LoopCtx, c: ConnectorCall, content: string, extra: Record<string, unknown> = {}): Step {
  const { p } = ctx;
  ctx.struggle.argErrored.add(c.call.name);
  const attempt = (ctx.argErrorCount.get(c.call.name) ?? 0) + 1;
  ctx.argErrorCount.set(c.call.name, attempt);
  captureEvent({ name: "tool_error", server: c.server, tool: c.call.name, reason: "arg_error", connector: c.connectorId, provider: p.provider, model: p.modelId, attempt, ...extra, loopId: ctx.loopId });
  ctx.dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: c.call.name, ok: false, args: safeJson(c.call.arguments), error: content });
  p.onToolResult?.({ tool: c.bareTool, server: c.connectorId, ok: false });
  ctx.messages.push({ role: "tool", toolCallId: c.call.id, content });
  if (ctx.bumpDead() >= MAX_CONSECUTIVE_DEAD) return ctx.finishExhausted(), "stop";
  return "next";
}

/**
 * Before any gate: the context budget and the per-tool cap REFUSE without dispatching (the
 * loop stops only if the model insists next response); then the two definitive "the model
 * malformed this call" verdicts that never reach the server. `"go"` = proceed to the gates.
 */
export function precheckCall(ctx: LoopCtx, c: ConnectorCall): Step | "go" {
  const { p, st } = ctx;
  const { call, args, turn } = c;
  captureEvent({ name: "tool_called", server: c.server, tool: call.name, connector: c.connectorId, provider: p.provider, model: p.modelId, loopId: ctx.loopId });
  if (ctx.usedChars() >= ctx.charBudget) {
    ctx.messages.push({ role: "tool", toolCallId: call.id, content: contextBudgetNote(call.name) });
    ctx.dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: call.name, ok: false, args: safeJson(call.arguments), error: `budget de contexte atteint (${ctx.charBudget} car.) — appel non dispatché` });
    if (st.budgetNotedTurn >= 0 && st.budgetNotedTurn < turn)
      return ctx.finishExhausted({ tool: call.name, web: isGovernedWebTool(call.name) }), "stop";
    st.budgetNotedTurn = turn;
    return "next";
  }
  const capMax = maxSameToolCalls(call.name, isConfidentReadOnly(call.name, ctx.toolInfo.get(call.name)));
  if ((ctx.callCounts.get(call.name) ?? 0) >= capMax) {
    ctx.messages.push({ role: "tool", toolCallId: call.id, content: capRefusalNote(call.name, capMax) });
    ctx.dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: call.name, ok: false, args: safeJson(call.arguments), error: `cap per-tool atteint (${capMax}) — appel non dispatché` });
    if ((ctx.capNotedTurn.get(call.name) ?? turn) < turn)
      return ctx.finishExhausted({ tool: call.name, web: isGovernedWebTool(call.name) }), "stop";
    ctx.capNotedTurn.set(call.name, turn);
    return "next";
  }
  ctx.callCounts.set(call.name, (ctx.callCounts.get(call.name) ?? 0) + 1);

  // Raw arguments that were not valid JSON: never a silently-emptied `{}` to the server.
  if (call.argsError) {
    const attempt = (ctx.argErrorCount.get(call.name) ?? 0) + 1;
    const content =
      `Tool error: les arguments de l'appel n'étaient pas un JSON valide (${call.argsError}). ` +
      `Renvoie un objet JSON strictement valide et conforme au schéma, puis réessaie.` +
      argErrorHint(call.name, ctx.toolInfo.get(call.name)?.inputSchema, attempt);
    return bounceArgError(ctx, c, content);
  }
  // BLIND call (real tool, schema never loaded): the schema registers first; bounce only on a
  // provable violation (`schemaBlind.ts`).
  if (!ctx.toolInfo.has(call.name) && ctx.fullByName.has(call.name)) {
    const full = ctx.fullByName.get(call.name)!;
    ctx.toolInfo.set(call.name, full);
    ctx.toolDefs.push(toolDefOf(full));
    const { problems, param } = schemaBlindProblems(full.inputSchema, args);
    captureEvent({ name: "tool_schema_blind", server: c.server, tool: call.name, verdict: problems.length ? "bounced" : "dispatched", provider: p.provider, model: p.modelId, loopId: ctx.loopId });
    if (problems.length) {
      const attempt = (ctx.argErrorCount.get(call.name) ?? 0) + 1;
      const content =
        `Tool error: appel envoyé sans avoir chargé le schéma de \`${call.name}\`, et les arguments ne le respectent pas — ${problems.join(" ; ")}. RIEN n'a été envoyé au service.` +
        argErrorHint(call.name, full.inputSchema, attempt);
      return bounceArgError(ctx, c, content, param ? { param } : {});
    }
  }
  return "go";
}
