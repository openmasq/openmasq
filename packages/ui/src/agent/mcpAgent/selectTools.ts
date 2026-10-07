import { contextWindow } from "@openmasq/llm";
import type { McpTool } from "@openmasq/mcp";
import { captureEvent } from "../../analytics";
import { pushDebug, updateDebug } from "../../state/debug/debug";
import { countByConnector, rescueNamedConnectors, rescueScopedConnectors } from "../connectorRescue";
import { rescueEntryTools } from "../entryTools";
import { isAbortError } from "../mcpAgentAbort";
import { estToolTokens, fitToBudget } from "../toolCatalog";
import {
  RouterUnreadableError,
  needsRouting,
  noteRouterFailure,
  noteRouterSuccess,
  routeTools,
  routerCooldownActive,
} from "../toolRouter";
import type { McpAgentParams } from "./types";

export interface ToolSelection {
  /** The loaded subset — possibly EMPTY when routing picked none (the caller still enters
   *  the loop with the catalog + `load_tools`). */
  tools: McpTool[];
  /** Wall-clock of the router MODEL call, success or failure. Absent when no call ran (no
   *  routing needed, cooldown, Stop). */
  routerMs?: number;
}

/**
 * Choose which tool SCHEMAS to load this turn.
 * Throws only when not even the shortest schema fits the model's window.
 */
export async function selectTools(p: McpAgentParams, all: McpTool[], loopId?: string): Promise<ToolSelection> {
  const win = contextWindow(p.modelId) ?? 128_000;
  if (!needsRouting(estToolTokens(all), all.length, win, p.routingConfig?.routing)) return { tools: all };
  let routerMs: number | undefined;

  const userText = [...p.history].reverse().find((m) => m.role === "user")?.content ?? "";
  let kept: McpTool[];
  const routePhase = pushDebug(
    {
      type: "phase", scope: "loop", label: "Routage des outils",
      detail: `${all.length} outils (~${Math.round(estToolTokens(all) / 1000)}k tokens) > budget — routage en cours…`,
    },
    p.convId,
  );
  // The verdict is kept so the rescue below ADDS to the journal line instead of overwriting it.
  let routeDetail = "";
  // A recent router failure (usually configuration) skips straight to the deterministic pare.
  if (routerCooldownActive(Date.now())) {
    kept = fitToBudget(all, win, p.routingConfig?.catalog);
    routeDetail = `routeur en pause (échec récent) → repli déterministe : ${kept.length}/${all.length} outils`;
    updateDebug(routePhase, { ok: true, detail: routeDetail });
  } else {
    const routerT0 = Date.now();
    try {
      const keep = await routeTools({
        tools: all.map((t) => ({ name: t.name, description: t.description, serverId: t.serverId })),
        userText,
        complete: p.host.completeTools!,
        provider: p.provider,
        modelId: p.modelId,
        apiKey: p.apiKey,
        baseUrl: p.baseUrl,
        requestId: p.requestId,
        cfg: p.routingConfig?.routing,
        loopId,
      });
      routerMs = Date.now() - routerT0;
      noteRouterSuccess();
      kept = all.filter((t) => keep.has(t.name));
      routeDetail = kept.length
        ? `pick routeur : ${kept.length}/${all.length} — ${kept.slice(0, 12).map((t) => t.name).join(", ")}${kept.length > 12 ? "…" : ""}`
        : `pick routeur VIDE (0/${all.length}) — la boucle continue avec le catalogue + load_tools`;
      updateDebug(routePhase, { ok: true, detail: routeDetail });
      // An EMPTY pick is a measurable miss: the model must go through `load_tools`.
      if (!kept.length) {
        captureEvent({ name: "tool_route_miss", kind: "empty", offered: 0, available: all.length, connector: "", provider: p.provider, model: p.modelId, loopId });
      }
    } catch (e) {
      // Stop during the router call is neither a failure nor a miss: no cooldown, no event.
      // Return at once; the loop's own `aborted()` finalizes the bubble.
      if (p.signal?.aborted || isAbortError(e)) {
        updateDebug(routePhase, { ok: false, detail: "routage interrompu (Stop)" });
        return { tools: [] };
      }
      routerMs = Date.now() - routerT0;
      // UNREADABLE (typed) = model flakiness on ONE call: same fallback, never the config cooldown.
      if (e instanceof RouterUnreadableError) {
        captureEvent({ name: "tool_route_miss", kind: "unreadable", offered: 0, available: all.length, connector: "", provider: p.provider, model: p.modelId, loopId });
      } else noteRouterFailure(Date.now());
      kept = fitToBudget(all, win, p.routingConfig?.catalog);
      routeDetail = `routeur en échec (${e instanceof Error ? e.message.slice(0, 120) : "?"}) → repli déterministe : ${kept.length}/${all.length} outils`;
      updateDebug(routePhase, { ok: false, detail: routeDetail });
    }
  }
  // The router is a model call and prunes the ENTRY tool a request can't do without;
  // the rescues are additive and bounded (`entryTools.ts`, `connectorRescue.ts`).
  // Every rescue is reported, so `routerOffered` (summary) minus `offered` (miss) is explained.
  const rescueEvent = (via: "entry" | "scoped" | "named", r: { id: string; added: number }): void =>
    captureEvent({ name: "tool_route_rescue", via, connector: r.id, tools: r.added, provider: p.provider, model: p.modelId, loopId });
  {
    const before = kept.length;
    kept = rescueEntryTools(kept, all, userText);
    for (const r of countByConnector(kept.slice(before))) rescueEvent("entry", r);
    const s = rescueScopedConnectors(kept, all, p.scopedConnectors ?? [], win);
    const n = rescueNamedConnectors(s.kept, all, userText, win);
    kept = n.kept;
    for (const r of s.rescued) rescueEvent("scoped", r);
    for (const r of n.rescued) rescueEvent("named", r);
    const parts = [...s.rescued.map((r) => `${r.id} (+${r.added})`), ...n.rescued.map((r) => `${r.id} (+${r.added}, nommé)`)];
    if (parts.length)
      updateDebug(routePhase, { ok: true, detail: `${routeDetail} · rattrapage : ${parts.join(", ")}` });
  }
  if (estToolTokens(kept) > win * 0.85) {
    // The router may legitimately keep EVERYTHING; the definitions then exceed the window.
    // A capacity limit, not a failure: keep the least verbose schemas, `load_tools` covers the rest.
    const fitted = fitToBudget(kept, win, p.routingConfig?.catalog);
    if (fitted.length) {
      updateDebug(routePhase, {
        ok: true,
        detail:
          `${routeDetail} · budget de contexte : ${fitted.length}/${kept.length} outils gardés, ` +
          "les autres restent accessibles via load_tools",
      });
      return { tools: fitted, routerMs };
    }
    const est = Math.round(estToolTokens(kept) / 1000);
    const ctx = Math.round(win / 1000);
    throw new Error(
      `Trop d'outils connectés pour ${p.modelId} (~${est}k tokens de définitions > ${ctx}k de contexte). ` +
        "Choisis un modèle à plus grand contexte ou déconnecte des connecteurs.",
    );
  }
  return { tools: kept, routerMs };
}
