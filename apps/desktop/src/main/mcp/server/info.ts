import { listServers, type ServerSpec } from "../persist";
import { connected, toolCounts } from "./registry";
import { connectorIdOf } from "./accounts";
import { getCatalogEntry, catalogForUi, type UiCatalogEntry } from "../catalog";
import type { McpServerInfo } from "./types";

function displayUrl(spec: ServerSpec): string {
  if (spec.kind === "stdio") {
    const entry = spec.catalogId ? getCatalogEntry(spec.catalogId) : undefined;
    return entry ? [entry.command, ...entry.args].join(" ") : "local server";
  }
  if (spec.kind === "browser") return "chromium (CDP)";
  return spec.url ?? "";
}

/** Les grants de chemin d'un serveur local, normalisés en listes — la carte les affiche
 *  et les édite. `undefined` (plutôt qu'un objet vide) hors stdio, pour que l'UI n'ait
 *  qu'un test à faire. */
function paramsOf(spec: ServerSpec): Record<string, string[]> | undefined {
  if (spec.kind !== "stdio" || !spec.params) return undefined;
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(spec.params)) out[k] = Array.isArray(v) ? v : v ? [v] : [];
  return out;
}

export function infoFor(spec: ServerSpec): McpServerInfo {
  const on = connected.has(spec.id);
  return {
    params: paramsOf(spec),
    id: spec.id,
    name: spec.name,
    url: displayUrl(spec),
    kind: spec.kind ?? "http",
    connected: on,
    authorized: on,
    toolCount: toolCounts.get(spec.id),
    connectorId: connectorIdOf(spec),
    label: spec.label,
    credMode: spec.credMode,
    // BYO keys count as "stored" once the public client id is present (a device-flow
    // connector like GitHub has no secret; Google's secret rides along with the id).
    hasCreds: spec.credMode === "byo" && !!spec.clientId,
  };
}

export function mcpCatalog(): UiCatalogEntry[] {
  return catalogForUi();
}

export function mcpList(): McpServerInfo[] {
  return listServers().map(infoFor);
}
