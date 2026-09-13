// WHICH CATEGORIES a tool RESULT keeps in clear — the one home, so the full redaction path
// and the browser's clear-mode replay (`agent/navClearRedact.ts`) cannot answer differently
// for the same tool (rule 9). Its own module because both of its callers sit on the size cap.
import { categoriesForLevel, disabledKindsOf, type ConnectorMasking } from "@openmasq/catalog";
import { findConnector } from "@openmasq/catalog/mcp";
import { isWebBrowseTool } from "../state/browserPolicy";
import { toolClearKinds } from "../agent/toolRedactionPolicy";

/** The category-clear policy for a tool's RESULTS, resolved onto a base `disabledKinds`.
 *  Public web-search connectors keep place/org names + URL/asset path & CDN key-noise in
 *  clear; the BROWSER keeps only place/org (it can read an AUTHENTICATED page, so
 *  secret/apikey/path stay REDACTED). Keyed off the tool-name connector prefix. Shared by
 *  the full redaction path below AND the clear-mode replay (`agent/navClearRedact.ts`),
 *  so the two views of "what may stay clear for this tool" cannot drift (root rule 9). */
export function disabledKindsForTool(
  disabledKinds: string[],
  tool?: string,
  /** `Settings.connectorMasking` — the connectors that do NOT follow the global rules. */
  perConnector?: Record<string, ConnectorMasking>,
): string[] {
  if (!tool) return disabledKinds;
  const px = tool.indexOf("__");
  const connectorId = px > 0 ? tool.slice(0, px) : tool;
  const clear = toolClearKinds(
    connectorId,
    findConnector(connectorId)?.category === "search",
    isWebBrowseTool(tool),
  );
  // A connector with a LEVEL of its own is masked at that level instead of the global rules
  // — the one field that REPLACES. Its own `disable` ADDS, and so do the clear kinds this
  // tool's category already earns: neither may make a connector mask LESS than its level
  // says, which is the invariant `@openmasq/catalog` states and both surfaces obey.
  const own = perConnector?.[connectorId];
  const base = own?.level ? disabledKindsOf(categoriesForLevel(own.level)) : disabledKinds;
  const added = [...clear, ...(own?.disable ?? [])];
  return added.length ? [...new Set([...base, ...added])] : base;
}
