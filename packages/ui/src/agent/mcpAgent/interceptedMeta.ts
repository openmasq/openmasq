import { isAbortError, raceAbort } from "../mcpAgentAbort";
import { safeJson } from "../mcpAgentUtil";
import { resolveSuggestCall } from "../suggestIntegrations";
import { resolveLoadTools, toolDefOf } from "../toolCatalog";
import type { Step, ToolCall } from "./call";
import type { LoopCtx } from "./context";

/** `load_tools`: grows the callable set from the full connected surface, within the context budget. */
export function handleLoadTools(ctx: LoopCtx, call: ToolCall, args: Record<string, unknown>): Step {
  ctx.p.onToolProgress?.("Choix des bons outils");
  const { add, content } = resolveLoadTools(args.tool_names, ctx.fullByName, ctx.toolInfo, ctx.win * 0.85);
  for (const t of add) {
    ctx.toolInfo.set(t.name, t);
    ctx.toolDefs.push(toolDefOf(t));
  }
  // « Inconnus : » is the exact marker `resolveLoadTools` emits for a name matching nothing.
  if (content.includes("Inconnus :")) ctx.loopStats.loadToolsUnknown += 1;
  ctx.dbg({ type: "tool", vault: ctx.p.vault, kinds: ctx.p.kinds, name: "load_tools", ok: true, args: safeJson(call.arguments), result: content });
  ctx.messages.push({ role: "tool", toolCallId: call.id, content });
  return "next";
}

/** `suggest_integrations`: ids validated against the not-connected set, pinned as connect cards. */
export function handleSuggestIntegrations(ctx: LoopCtx, call: ToolCall, args: Record<string, unknown>): Step {
  ctx.p.onToolProgress?.("Recherche d'une intégration");
  const { ids, message } = resolveSuggestCall(args.integration_ids, ctx.suggestCandidates, ctx.requestText, ctx.alreadyConnected);
  if (ids.length) {
    ctx.st.suggested = true;
    ctx.p.onSuggestIntegrations?.(ids);
  }
  ctx.dbg({ type: "tool", vault: ctx.p.vault, kinds: ctx.p.kinds, name: "suggest_integrations", ok: ids.length > 0, args: safeJson(call.arguments), result: message });
  ctx.messages.push({ role: "tool", toolCallId: call.id, content: message });
  return "next";
}

/** `memory_search` — rule 11 by hand: the query is un-redacted like an outgoing arg, the
 *  result re-redacted through the SAME vault; no redactor ⇒ masked (fail closed). */
export async function handleMemorySearch(ctx: LoopCtx, call: ToolCall, args: Record<string, unknown>): Promise<Step> {
  const { p } = ctx;
  const query = ctx.wireArg(typeof args.query === "string" ? args.query : "");
  let found = "";
  try {
    found = (await raceAbort(Promise.resolve(p.searchMemory!(query)), p.signal)) ?? "";
  } catch (e) {
    if (ctx.aborted() || isAbortError(e)) return ctx.finalizeAborted(), "stop";
    found = "";
  }
  let content: string;
  if (found) {
    content = ctx.redactResult
      ? await ctx.redactResult(`Souvenirs correspondants :\n${found}`, p.vault, "memory_search")
      : "(résultat masqué : redaction indisponible)";
  } else {
    content = "Aucun souvenir correspondant dans la mémoire de l'utilisateur.";
  }
  if (ctx.aborted()) return ctx.finalizeAborted(), "stop";
  ctx.dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: "memory_search", ok: true, args: safeJson(call.arguments), result: content });
  p.onToolResult?.({ tool: "memory_search", server: "memoire", ok: true, summary: found ? undefined : "aucun résultat" });
  ctx.messages.push({ role: "tool", toolCallId: call.id, content });
  ctx.st.deadStreak = 0; // the lookup SUCCEEDED either way — an empty store is an answer
  return "next";
}
