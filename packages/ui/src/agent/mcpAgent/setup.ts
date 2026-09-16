import { connectorIdFromInstance, findConnector } from "@openmasq/catalog/mcp";
import { contextWindow, type ChatMessage, type ToolDef } from "@openmasq/llm";
import type { McpTool } from "@openmasq/mcp";
import { isConnectorAllowed } from "../../privacy/orgAllowList";
import { typedPartOfWire } from "../../send/foldPayload";
import { isBrowserWriteTool, isWebBrowseTool } from "../../state/browserPolicy";
import { scopePreflight } from "../integrationMatch";
import { INTERCEPTED_META_TOOLS, MEMORY_SEARCH_DEF, RUN_PYTHON_DEF, WEB_FETCH_MANY_DEF } from "../interceptedTools";
import { BROWSER_ENABLE_HINT, withToolGuidance } from "../mcpAgentGuidance";
import { sanitizeToolSchemas } from "../schemaSanity";
import {
  connectedConnectors,
  connectorIdsFromTools,
  notConnectedConnectors,
  suggestGuidance,
  suggestIntegrationsDef,
} from "../suggestIntegrations";
import { LOAD_TOOLS_DEF, toolCatalog, toolDefOf } from "../toolCatalog";
import type { RedactionBoundary } from "./boundary";
import { selectTools } from "./selectTools";
import type { McpAgentParams } from "./types";

export { INTERCEPTED_META_TOOLS };

export interface LoopSetup {
  allTools: McpTool[];
  /** Connected tools after the org allow-list and the read-only browser strip. */
  mcpTools: McpTool[];
  /** The routed subset whose schemas are callable at start. */
  selected: McpTool[];
  fullByName: Map<string, McpTool>;
  /** Callable schemas — GROW in place as `load_tools` pulls more. Sorted by name: a stable
   *  prompt prefix is what lets the provider-side cache hit. */
  toolDefs: ToolDef[];
  toolInfo: Map<string, McpTool>;
  win: number;
  hasBrowser: boolean;
  connectedIds: ReturnType<typeof connectorIdsFromTools>;
  suggestCandidates: ReturnType<typeof notConnectedConnectors>;
  alreadyConnected: ReturnType<typeof connectedConnectors>;
  scope: ReturnType<typeof scopePreflight>;
  /** Only the TYPED part of the last user message (folded documents and our notes excluded). */
  requestText: string;
  /** The wire context: history + prior attempt's transcript + guidance. */
  messages: ChatMessage[];
  priorTranscript: ChatMessage[];
  baseLen: number;
}

/** Org allow-list (rule 7): a tool passes only if ITS connector is opened. The connector is
 *  read from the NAME's prefix — `serverId` is « ipc » for every tool of the single connection
 *  — with `serverId` as the fallback for hosts giving one connection per connector. A tool no
 *  connector claims (`run_python`) is not governed here; a manual `custom-…` server is. */
function isBlockedTool(t: McpTool, allowedServerIds: string[]): boolean {
  const i = t.name.indexOf("__");
  const id = (i > 0 ? t.name.slice(0, i) : undefined) ?? t.serverId;
  if (!id) return false;
  const governed = id.startsWith("custom-") || !!findConnector(connectorIdFromInstance(id));
  return governed && !isConnectorAllowed(id, allowedServerIds);
}

/** Lists, filters, routes and offers the tools. `null` ⇒ nothing to run: the caller falls
 *  back to plain streaming. */
export async function buildLoopSetup(
  p: McpAgentParams,
  b: RedactionBoundary,
  loopId: string,
): Promise<LoopSetup | null> {
  // Sanitized BEFORE any reader — a degenerate `required` makes a tool uncallable.
  const allTools = sanitizeToolSchemas(await b.client.listTools());
  const allowed = p.allowedServerIds;
  const notBlocked = allowed ? allTools.filter((t) => !isBlockedTool(t, allowed)) : allTools;
  // Read-only browser: an injected page can't steer the model into acting in a SaaS.
  const mcpTools = p.browserReadOnly ? notBlocked.filter((t) => !isBrowserWriteTool(t.name)) : notBlocked;
  // Enter the loop when there are connector tools OR an intercepted capability is on.
  if (mcpTools.length === 0 && !p.runPython && !p.searchMemory && !p.fetchMany) return null;

  const selected = await selectTools(p, mcpTools, loopId);
  // Pruned = the callable set is a STRICT subset (an EMPTY pick included): the model gets the
  // full catalog + `load_tools` so it still knows every tool.
  const pruned = selected.length < mcpTools.length;
  const win = contextWindow(p.modelId) ?? 128_000;
  const fullByName = new Map<string, McpTool>(mcpTools.map((t) => [t.name, t]));
  const toolDefs: ToolDef[] = selected.map(toolDefOf).sort((a, b) => a.name.localeCompare(b.name));
  if (pruned) toolDefs.push(LOAD_TOOLS_DEF);
  if (p.runPython) toolDefs.push(RUN_PYTHON_DEF);
  if (p.searchMemory) toolDefs.push(MEMORY_SEARCH_DEF);
  if (p.fetchMany) toolDefs.push(WEB_FETCH_MANY_DEF);
  // The built-in browser covers web search whether CONNECTED or merely ENABLEABLE: search
  // connectors are dropped from the suggestions, and an enableable browser is itself a candidate.
  const hasBrowser = mcpTools.some((t) => isWebBrowseTool(t.name));
  const browserState = { connected: hasBrowser, enableable: !!p.browserEnableable };
  // Connected = read from the tool NAMES (`connectorIdsFromTools`), never `serverId` alone.
  const connectedIds = connectorIdsFromTools(allTools);
  const suggestCandidates = p.onSuggestIntegrations ? notConnectedConnectors(connectedIds, browserState) : [];
  const alreadyConnected = p.onSuggestIntegrations ? connectedConnectors(connectedIds) : [];
  let suggestBlock = suggestCandidates.length ? suggestGuidance(suggestCandidates) : "";
  if (suggestCandidates.length) toolDefs.push(suggestIntegrationsDef(suggestCandidates));
  const scope = scopePreflight(p.scopedConnectors, connectedIds);
  const requestText = typedPartOfWire(String([...p.history].reverse().find((m) => m.role === "user")?.content ?? ""));
  if (p.browserEnableable && !hasBrowser) suggestBlock += BROWSER_ENABLE_HINT;

  const toolInfo = new Map<string, McpTool>(selected.map((t) => [t.name, t]));
  // RESUME: a retry seeds the PRIOR attempt's transcript AFTER the history so the model
  // continues from where it stopped; everything past `baseLen` is THIS run's new work.
  const priorTranscript = p.resumeTranscript ?? [];
  const catalogEnabled = p.routingConfig?.catalog?.enabled ?? true;
  const messages = withToolGuidance(
    [...p.history, ...priorTranscript],
    pruned && catalogEnabled ? toolCatalog(mcpTools, p.routingConfig?.catalog) : undefined,
    !!p.runPython,
    suggestBlock,
    hasBrowser,
    !!p.fetchMany,
  );
  return {
    allTools, mcpTools, selected, fullByName, toolDefs, toolInfo, win, hasBrowser,
    connectedIds, suggestCandidates, alreadyConnected, scope, requestText,
    messages, priorTranscript, baseLen: messages.length,
  };
}
