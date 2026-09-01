import type { Messages } from "@openmasq/i18n";
import { connectorCopy } from "../../../help/catalogCopy";
import {
  BROWSER_CONNECTOR_ID,
  connectorIdFromInstance,
  findConnector,
  type McpConnector,
} from "@openmasq/catalog/mcp";
import type { CredMode, McpCatalogEntry, McpServerInfo } from "../../../host";
import { MCP_PRESETS } from "./mcpPresets";
import { credGroupOf } from "./credGroup";
import { localServerId } from "../../../state/conversation/mcpIds";

/**
 * The unified MCP connector list model — one shape for the three historically
 * separate kinds (remote OAuth presets / desktop-direct connectors / local stdio
 * servers) so the Settings tab can grid + search + open them uniformly. Pure
 * (no host calls): `buildMcpItems` merges the catalogs with the LIVE server state.
 */
export type McpItemKind = "remote" | "direct" | "local" | "browser";

/** The single controllable-browser connector (not multi-account). Its id + display
 *  metadata live in `@openmasq/catalog/mcp` (`transport:"builtin"`) — re-exported
 *  here so the existing `./mcpItems` importers are unchanged. */
export { BROWSER_CONNECTOR_ID };

/** One connected (or configured) ACCOUNT of a multi-account connector (direct OR
 *  remote). The `serverId` is the connection INSTANCE id used to disconnect/
 *  reconnect/inspect it. */
export interface McpAccount {
  serverId: string;
  label?: string;
  connected: boolean;
  toolCount?: number;
  error?: string;
  credMode?: CredMode;
}

export interface McpItem {
  /** The connector/catalog id (github, notion, filesystem, …). */
  id: string;
  /** The id used to route live state / disconnect / inspect — for local this is
   *  `local-<id>`, otherwise the same as `id`. */
  serverId: string;
  name: string;
  desc: string;
  tone: string;
  category?: string;
  kind: McpItemKind;
  connected: boolean;
  toolCount?: number;
  error?: string;
  /** The org disallows this connector (locked, but the detail modal still opens). */
  locked: boolean;
  /** remote: whether a config/URL already exists; needs a URL when false + no url. */
  configured?: boolean;
  url?: string;
  auth?: "oauth" | "apikey";
  /** direct: the catalog connector (drives managed/BYO/slack action logic). */
  connector?: McpConnector;
  /** direct: whether the user's OWN (BYO) client id/secret are already stored on
   *  this machine — so the "Mes clés" form can say so + offer to reuse them. */
  hasCreds?: boolean;
  /** direct + remote: the connected/configured ACCOUNTS of this connector
   *  (multi-account). One entry per connection instance; empty/absent = not connected. */
  accounts?: McpAccount[];
  /** local: the stdio catalog entry (command + env + path-grant fields). */
  entry?: McpCatalogEntry;
  /** local CONNECTED: the folders already granted, by param key — what the
   *  card displays and edits without going through a disconnect. */
  params?: Record<string, string[]>;
  /** A server the USER added by URL — not vetted by the app. It gets its own section
   *  rather than a category group, so "what did I point this app at" is answerable at
   *  a glance instead of hiding among the audited connectors. */
  custom?: boolean;
}

/** A custom endpoint may legitimately carry its API key in the query string (the
 *  catalog's own Exa pattern, `?exaApiKey=…`), so the raw URL is a secret — never render
 *  it. The card and the modal show this instead. */
export function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}${u.search ? "?…" : ""}`;
  } catch {
    return url;
  }
}

/** Build the unified item list from the catalogs + the live server state. */
export function buildMcpItems(opts: {
  servers: McpServerInfo[];
  catalog: McpCatalogEntry[];
  directConnectors: McpConnector[];
  isBlocked: (id: string) => boolean;
  /** BYO credential groups that already have keys stored (from host.mcp.byoCredGroups)
   *  — so a Google connector shows "déjà enregistré" once ANY Google connector's keys
   *  were entered, even one the user hasn't opened. */
  credGroups?: Set<string>;
  /** Include the controllable-browser connector (only when the desktop host exposes
   *  `enableBrowser` — absent in the browser preview). */
  browserEnabled?: boolean;
  /** The caller's language — name + description come from `connectorCopy`. */
  t: Messages;
}): McpItem[] {
  const { servers, catalog, directConnectors, isBlocked, credGroups, browserEnabled, t } = opts;
  const byId = new Map(servers.map((s) => [s.id, s]));
  const items: McpItem[] = [];

  // Controllable browser — a single, no-account connector driving @playwright/mcp
  // in an isolated process. Only shown when the host supports it. Name/desc/tone come
  // from the catalog (`transport:"builtin"`) so this card and the chat suggestion card
  // describe the same thing.
  const browser = findConnector(BROWSER_CONNECTOR_ID);
  if (browserEnabled && browser) {
    const info = byId.get(BROWSER_CONNECTOR_ID);
    items.push({
      id: browser.id,
      serverId: browser.id,
      ...connectorCopy(browser.id, browser, t),
      tone: browser.tone ?? "mint",
      category: browser.category,
      kind: "browser",
      connected: !!info?.connected,
      toolCount: info?.toolCount,
      error: info?.error,
      locked: isBlocked(BROWSER_CONNECTOR_ID),
      connector: browser,
    });
  }

  // remote presets (OAuth / API-key). Multi-account: gather EVERY connection
  // instance whose id resolves to this preset (`notion`, `notion--a1b2`).
  for (const p of MCP_PRESETS) {
    const primary = byId.get(p.id); // the first/only account (id === connector id)
    const instances = servers.filter((s) => connectorIdFromInstance(s.id) === p.id);
    const accounts: McpAccount[] = instances.map((s) => ({
      serverId: s.id,
      label: s.label,
      connected: s.connected,
      toolCount: s.toolCount,
      error: s.error,
    }));
    const connectedAccounts = accounts.filter((a) => a.connected);
    const toolCount = connectedAccounts.reduce((n, a) => n + (a.toolCount ?? 0), 0);
    items.push({
      id: p.id,
      serverId: p.id,
      ...connectorCopy(p.id, p, t),
      tone: p.tone,
      category: p.category,
      kind: "remote",
      connected: connectedAccounts.length > 0,
      toolCount: connectedAccounts.length ? toolCount : undefined,
      error: connectedAccounts.length ? undefined : primary?.error,
      locked: isBlocked(p.id),
      configured: instances.length > 0,
      url: primary?.url || p.url,
      auth: p.auth,
      accounts,
    });
  }

  // desktop-direct connectors (github / google / slack). Multi-account: gather EVERY
  // connection instance whose id resolves to this connector (`gmail`, `gmail--a1b2`).
  for (const c of directConnectors) {
    const instances = servers.filter((s) => connectorIdFromInstance(s.id) === c.id);
    const accounts: McpAccount[] = instances.map((s) => ({
      serverId: s.id,
      label: s.label,
      connected: s.connected,
      toolCount: s.toolCount,
      error: s.error,
      credMode: s.credMode,
    }));
    const primary = byId.get(c.id); // the first/only account (id === connector id)
    const connectedAccounts = accounts.filter((a) => a.connected);
    const toolCount = connectedAccounts.reduce((n, a) => n + (a.toolCount ?? 0), 0);
    items.push({
      id: c.id,
      serverId: c.id,
      ...connectorCopy(c.id, c, t),
      tone: c.tone ?? "mint",
      category: c.category,
      kind: "direct",
      connected: connectedAccounts.length > 0,
      toolCount: connectedAccounts.length ? toolCount : undefined,
      // Surface a first-account error only when nothing is connected (so a failed
      // primary still shows its reason on the card).
      error: connectedAccounts.length ? undefined : primary?.error,
      locked: isBlocked(c.id),
      connector: c,
      accounts,
      // Own stored creds OR any sibling in the same group (Google connectors share).
      hasCreds: accounts.some((a) => a.credMode === "byo") || credGroups?.has(credGroupOf(c.id)),
    });
  }

  // custom (user-added HTTP) servers not covered by a preset/direct/local id.
  // ⚠️ BUILT-IN ids belong here too. The browser is a server the APP registers, and it
  // already has its card above — left out of this set it fell through and got a SECOND,
  // "custom" card, so « Navigateur » showed up once under Automatisation and once among
  // the user-added servers. A built-in is never something the user pointed us at.
  const knownIds = new Set([
    BROWSER_CONNECTOR_ID,
    ...MCP_PRESETS.map((p) => p.id),
    ...directConnectors.map((c) => c.id),
  ]);
  for (const s of servers) {
    if (
      // A preset/direct INSTANCE (`notion--a1b2`, `gmail--a1b2`) resolves to a known
      // connector id — it belongs to that card's accounts, not a bogus custom card.
      knownIds.has(connectorIdFromInstance(s.id)) ||
      s.id.startsWith("local-") ||
      s.id.startsWith("broker-")
    )
      continue;
    items.push({
      id: s.id,
      serverId: s.id,
      name: s.name,
      desc: displayUrl(s.url),
      tone: "mint",
      kind: "remote",
      connected: s.connected,
      toolCount: s.toolCount,
      error: s.error,
      locked: isBlocked(s.id),
      configured: true,
      url: s.url,
      custom: true,
    });
  }

  // local stdio catalog servers
  for (const entry of catalog) {
    const serverId = localServerId(entry.id);
    const info = byId.get(serverId);
    items.push({
      id: entry.id,
      serverId,
      ...connectorCopy(entry.id, entry, t),
      tone: entry.tone,
      kind: "local",
      connected: !!info?.connected,
      toolCount: info?.toolCount,
      error: info?.error,
      locked: isBlocked(entry.id),
      entry,
      params: info?.params,
    });
  }

  return items;
}

/** Case-insensitive name/description match for the search box. */
export function matchesSearch(item: McpItem, needle: string): boolean {
  if (!needle) return true;
  const n = needle.toLowerCase();
  return item.name.toLowerCase().includes(n) || item.desc.toLowerCase().includes(n);
}
