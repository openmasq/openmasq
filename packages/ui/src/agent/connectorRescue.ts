import type { McpTool } from "@openmasq/mcp";
import { connectorIdFromInstance, findConnector, type McpConnector } from "@openmasq/catalog/mcp";
import { estToolTokens } from "./toolCatalog";
import { connectorsForRequest } from "./integrationMatch";

/**
 * CONNECTOR-level rescues for the routing pre-pass — additive, deterministic, bounded.
 * The sibling of `entryTools.ts` (same reason to exist, one level up): the router is
 * itself a model call, so it misses, and what it leaves behind is a `load_tools(x) →
 * x_tool` chain a weak model won't perform. Extracted out of `mcpAgent.ts` because that
 * file is over the cap and a rescue is pure list arithmetic.
 *
 * Two rescues live here, deliberately DIFFERENT in when they fire:
 *
 * — the SCOPED rescue (a workflow's declared `servers`) fires on every send, because a
 *   declared scope is an explicit user intent with no false positive possible;
 *
 * — the NAMED rescue fires ONLY on an EMPTY pick. Name-recognition was considered and
 *   rejected as an always-on rule (« que peux-tu faire avec Webflow ? » names Webflow
 *   without wanting to call it, and loading thirty schemas starves the awareness
 *   catalog a capability question needs). On an empty pick that trade inverts: the
 *   model holds ZERO connector tools, so there is no successful routing to protect —
 *   only the schema-blind guess that follows (mesuré : 85 picks vides/30 j, tous
 *   modèles confondus, et la demande du journal du 06/08 NOMMAIT « intercom » en
 *   premier mot). A capability question that lands here pays a few schemas and still
 *   keeps the catalog: the set stays pruned.
 *
 * Both are BOUNDED by the same 85 % ceiling as the router's own guard, connector by
 * connector — a rescue must never turn a routing success into "too many tools". What
 * does not fit stays reachable via `load_tools`.
 */

export interface ConnectorRescueResult {
  kept: McpTool[];
  /** One entry per rescued connector — for the journal line and the telemetry. */
  rescued: { id: string; added: number }[];
}

/** Group the not-yet-kept tools by connector id — the same derivation as the catalog:
 *  the FIRST `__` is the connector boundary, and a multi-account prefix
 *  (`gmail--a1b2`) folds back to its brand. */
function unkeptByConnector(kept: McpTool[], all: McpTool[]): Map<string, McpTool[]> {
  const keptNames = new Set(kept.map((t) => t.name));
  const by = new Map<string, McpTool[]>();
  for (const t of all) {
    if (keptNames.has(t.name)) continue;
    const i = t.name.indexOf("__");
    const id = i > 0 ? connectorIdFromInstance(t.name.slice(0, i)) : (t.serverId ?? "");
    if (!id) continue;
    const list = by.get(id) ?? [];
    list.push(t);
    by.set(id, list);
  }
  return by;
}

/** Add whole connectors under the budget ceiling; skip one that would blow it. */
function addUnderBudget(
  kept: McpTool[],
  by: Map<string, McpTool[]>,
  wanted: ReadonlySet<string>,
  win: number,
): ConnectorRescueResult {
  const out = [...kept];
  const rescued: { id: string; added: number }[] = [];
  for (const [id, tools] of by) {
    if (!wanted.has(id)) continue;
    if (estToolTokens([...out, ...tools]) > win * 0.85) continue;
    out.push(...tools);
    rescued.push({ id, added: tools.length });
  }
  return { kept: out, rescued };
}

/**
 * The deterministic rescue of a workflow's DECLARED connectors. Journal du 27/07/2026 —
 * « pick routeur VIDE (0/296) » on a workflow explicitly scoped to Google Agenda; the
 * model left without a single calendar tool, went through `load_tools`, and ended up
 * INVENTING a write for want of being able to read.
 */
export function rescueScopedConnectors(
  kept: McpTool[],
  all: McpTool[],
  scopedConnectors: readonly string[],
  win: number,
): ConnectorRescueResult {
  if (!scopedConnectors.length) return { kept, rescued: [] };
  const scoped = new Set(scopedConnectors.map((id) => connectorIdFromInstance(id)));
  return addUnderBudget(kept, unkeptByConnector(kept, all), scoped, win);
}

/**
 * The empty-pick rescue of a connector the user NAMED. The matching is
 * `connectorsForRequest` — the SAME whole-word brand/alias rules the suggestion cards
 * use (rule 9: one matcher, or « notion » fires inside « notionnel » in one of the two
 * copies) — run over the CONNECTED connectors, with no suppression list: naming a
 * connected service is exactly the case a suggestion suppresses and a rescue wants.
 */
export function rescueNamedConnectors(
  kept: McpTool[],
  all: McpTool[],
  userText: string,
  win: number,
): ConnectorRescueResult {
  if (kept.length) return { kept, rescued: [] }; // only ever on an EMPTY pick
  if (!userText.trim()) return { kept, rescued: [] };
  const by = unkeptByConnector(kept, all);
  const connected: McpConnector[] = [];
  for (const id of by.keys()) {
    const c = findConnector(id);
    if (c) connected.push(c);
  }
  const named = connectorsForRequest(userText, connected, []);
  if (!named.length) return { kept, rescued: [] };
  return addUnderBudget(kept, by, new Set(named.map((c) => c.id)), win);
}
