import { isDeadTransport, type McpConnection, type McpTool } from "@openmasq/mcp";
import { getServer } from "../persist";
import { reportMainError } from "../../runtime/errorReport";
import { BROWSER_TOOL_ALLOWLIST } from "../browserTools";
import { BROWSER_ID, type McpAuthChoice } from "./types";

/**
 * The ONE home for the live MCP connection state (rule 10 — the security surface stays
 * legible: connections + routes + the change notifiers live together). Every other
 * mcp/ module reads/mutates these maps THROUGH this module, never a second copy.
 */
export const connected = new Map<string, McpConnection>();
export const routes = new Map<
  string,
  { server: McpConnection; realName: string; annotations?: McpTool["annotations"] }
>();
export const toolCounts = new Map<string, number>();

// Notified whenever the live connection/tool state changes (connect, disconnect,
// and especially the SILENT startup reconnect, which finishes AFTER the renderer
// already fetched the list once → the UI would otherwise show a reconnected
// connector as "disconnected" until a manual refresh). Main wires this to push an
// `mcp:changed` event to the window; the renderer re-fetches `list()`.
let onChanged: (() => void) | null = null;
export function setMcpChangeNotifier(fn: () => void): void {
  onChanged = fn;
}

// The OAuth authorize URL of an in-flight interactive connect, surfaced to the renderer
// so it can offer "Copier le lien" (open the login in a browser other than the default
// one `shell.openExternal` picks). The URL is the PUBLIC authorize URL that already goes
// to the browser — it carries the client id / scopes / redirect / `state` (a PKCE
// CHALLENGE), no secret and no verifier — so exposing it to the renderer leaks nothing.
let onOauthUrl: ((id: string, url: string) => void) | null = null;
export function setMcpOauthUrlNotifier(fn: (id: string, url: string) => void): void {
  onOauthUrl = fn;
}
export function emitMcpOauthUrl(id: string, url: string): void {
  onOauthUrl?.(id, url);
}

// Remote connectors that dropped UNEXPECTEDLY (their backend closed the transport)
// and need a manual reconnect — surfaced to the renderer as a bottom banner. Cleared
// when the connector reconnects, is disconnected/removed by the user, or the account
// switches. Keyed by instance id.
export const needsReconnect = new Set<string>();
let onNeedsReconnect: ((items: { id: string; name: string }[]) => void) | null = null;
export function setMcpNeedsReconnectNotifier(
  fn: (items: { id: string; name: string }[]) => void,
): void {
  onNeedsReconnect = fn;
}
export function emitNeedsReconnect(): void {
  onNeedsReconnect?.(
    [...needsReconnect].map((id) => {
      const s = getServer(id);
      return { id, name: s?.label || s?.name || id };
    }),
  );
}

// Asks the RENDERER which access mode to use when connecting a connector that
// allows BOTH signed-in and anonymous access (Firecrawl…): "account" vs "anonymous".
// Main wires this to a styled in-app modal via IPC (replacing the old native
// `dialog.showMessageBox`). Unset (e.g. no renderer / e2e) ⇒ the safe default, anonymous.
let authChoiceAsker: ((req: { id: string; name: string }) => Promise<McpAuthChoice>) | null = null;
export function setMcpAuthChoiceAsker(
  fn: (req: { id: string; name: string }) => Promise<McpAuthChoice>,
): void {
  authChoiceAsker = fn;
}
export function getAuthChoiceAsker():
  | ((req: { id: string; name: string }) => Promise<McpAuthChoice>)
  | null {
  return authChoiceAsker;
}

/** Evicts a dead connector from the live set, WITHOUT rebuilding routes or notifying — the half
 *  that `refreshRoutes` can call from its own loop without re-entering. */
function evictConnector(id: string): void {
  const server = connected.get(id);
  if (!server) return;
  connected.delete(id);
  toolCounts.delete(id);
  void Promise.resolve(server.close()).catch(() => {});
  needsReconnect.add(id);
}

/** A live connector's transport closed on its own (backend down, SSE dropped, child
 *  process exited). Drop it from the connected set + routes so `refreshRoutes`/the
 *  agentic loop stop probing a corpse (the "Connection closed"/"Not connected" loop), and
 *  flag it for the reconnect banner. Guards on `connected.has` so an intentional close is
 *  a no-op. Wired on BOTH transports: `connectRemote.ts` (HTTP) and `connect.ts`
 *  (stdio — the agent browser's `@playwright/mcp` child). */
export function handleConnectorClosed(id: string): void {
  if (!connected.has(id)) return;
  evictConnector(id);
  void refreshRoutes();
  emitNeedsReconnect();
}

/**
 * Re-list tools from every connected server, rebuilding the routing table.
 *
 * ⚠️ A server whose `listTools` fails on a DEAD transport is EVICTED, not just
 * flagged. Before, we set its counter to 0, reported it, and left it in
 * `connected`: the next refresh re-probed it and re-reported it, so a
 * single death produced one report per tick, indefinitely (848 Sentry events in eight
 * days for ONE vanished `@playwright/mcp` child). `onClose` covers the death that announces itself;
 * this covers the one discovered by calling — and both lead to the same place.
 *
 * ⚠️ **The table is built ON THE SIDE, then swaps all at once.** A `routes.clear()` up front
 * left it EMPTY during every `await listTools()` — one network round trip per
 * connected server. Any tool call landing in that window found no route
 * and died on "Unknown MCP tool", even though the tool existed: measured on 08/15, three
 * parallel calls to the SAME tool, two succeeded, one killed. Worse, two refreshes
 * running concurrently mutually emptied the table they had just filled. So we only publish
 * the COMPLETE result, and the swap is synchronous (no `await` between the clearing
 * and the filling): a reader sees the old table or the new one, never a gap.
 * `routes` stays the SAME object — `callTool.ts` holds the reference to it.
 */
export async function refreshRoutes(): Promise<McpTool[]> {
  const next = new Map<string, { server: McpConnection; realName: string; annotations?: McpTool["annotations"] }>();
  const all: McpTool[] = [];
  // Evicting DURING iteration would recursively call `refreshRoutes` via `handleConnectorClosed`:
  // we collect, then decide after the loop.
  const dead: string[] = [];
  for (const [id, server] of connected) {
    let tools: McpTool[];
    try {
      tools = await server.listTools();
    } catch (err) {
      toolCounts.set(id, 0);
      if (isDeadTransport(err)) dead.push(id);
      else reportMainError("mcp", "list-tools", err);
      continue;
    }
    // Hardening (C1): the browser connector exposes ONLY the allow-listed automation
    // tools — every other (cookie/storage/network/route/tracing/evaluate/…) tool is
    // denied by default, so a package bump can't silently surface a new exfil primitive.
    const usable =
      id === BROWSER_ID ? tools.filter((t) => BROWSER_TOOL_ALLOWLIST.has(t.name)) : tools;
    toolCounts.set(id, usable.length);
    for (const t of usable) {
      const name = `${id}__${t.name}`;
      next.set(name, { server, realName: t.name, annotations: t.annotations });
      all.push({ ...t, name, serverId: id });
    }
  }
  // THE SWAP — synchronous, no `await` interleaved (see the header).
  routes.clear();
  for (const [name, route] of next) routes.set(name, route);
  if (dead.length) {
    for (const id of dead) evictConnector(id);
    // The "reconnect needed" banner is the surface that TELLS the user about the
    // failure — it's what makes Sentry's silence acceptable.
    emitNeedsReconnect();
  }
  // Tell the renderer the live state moved (so a background reconnect surfaces).
  onChanged?.();
  return all;
}

export function mcpListToolsAll(): Promise<McpTool[]> {
  return refreshRoutes();
}

export async function mcpDisconnect(id: string): Promise<void> {
  const server = connected.get(id);
  if (server) {
    try {
      await server.close();
    } catch {
      /* best-effort */
    }
    connected.delete(id);
    toolCounts.delete(id);
  }
  // A user-driven disconnect is not a "needs reconnect" situation (also covers mcpRemove).
  if (needsReconnect.delete(id)) emitNeedsReconnect();
  await refreshRoutes();
}

export async function mcpCloseAll(): Promise<void> {
  for (const server of connected.values()) {
    try {
      await server.close();
    } catch {
      /* best-effort */
    }
  }
  connected.clear();
  routes.clear();
}
