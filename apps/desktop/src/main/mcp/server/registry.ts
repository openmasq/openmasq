import { isDeadTransport, type McpConnection, type McpTool } from "@openmasq/mcp";
import { getServer } from "../persist";
import { reportMainError } from "../../runtime/errorReport";
import { BROWSER_TOOL_ALLOWLIST } from "../browserTools";
import { BROWSER_ID, type McpAuthChoice } from "./types";

/** The ONE home for the live MCP connection state (rule 10): every other mcp/ module
 *  mutates these maps THROUGH this module. */
export const connected = new Map<string, McpConnection>();
export const routes = new Map<
  string,
  { server: McpConnection; realName: string; annotations?: McpTool["annotations"] }
>();
export const toolCounts = new Map<string, number>();

// Notified whenever the live state changes (especially the SILENT startup reconnect, which
// finishes AFTER the renderer's first fetch). Main pushes `mcp:changed`.
let onChanged: (() => void) | null = null;
export function setMcpChangeNotifier(fn: () => void): void {
  onChanged = fn;
}

// The authorize URL of an in-flight connect, for "Copier le lien". It is the PUBLIC URL
// already sent to the browser (a PKCE CHALLENGE, no secret, no verifier).
let onOauthUrl: ((id: string, url: string) => void) | null = null;
export function setMcpOauthUrlNotifier(fn: (id: string, url: string) => void): void {
  onOauthUrl = fn;
}
export function emitMcpOauthUrl(id: string, url: string): void {
  onOauthUrl?.(id, url);
}

// Connectors that dropped UNEXPECTEDLY and need a manual reconnect (the banner). Cleared
// on reconnect, user disconnect/remove, or account switch. Keyed by instance id.
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

// Asks the RENDERER "account" vs "anonymous" for a connector allowing both. Unset (e2e) ⇒
// the safe default, anonymous.
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

/** Evicts a dead connector WITHOUT rebuilding routes or notifying (re-entrancy-safe half). */
function evictConnector(id: string): void {
  const server = connected.get(id);
  if (!server) return;
  connected.delete(id);
  toolCounts.delete(id);
  void Promise.resolve(server.close()).catch(() => {});
  needsReconnect.add(id);
}

/** A transport closed on its own: drop it so nothing probes a corpse, and flag it for the
 *  banner. An intentional close is a no-op. Wired on BOTH transports (HTTP and stdio). */
export function handleConnectorClosed(id: string): void {
  if (!connected.has(id)) return;
  evictConnector(id);
  void refreshRoutes();
  emitNeedsReconnect();
}

/**
 * Re-list tools from every connected server, rebuilding the routing table.
 *
 * ⚠️ A server whose `listTools` fails on a DEAD transport is EVICTED, not just flagged,
 * or every tick re-probes and re-reports the corpse. `onClose` covers the death that
 * announces itself; this covers the one discovered by calling.
 *
 * ⚠️ The table is built ON THE SIDE, then swapped SYNCHRONOUSLY: a `routes.clear()` up
 * front leaves it EMPTY during every `await listTools()`, and a call landing in that window
 * dies on "Unknown MCP tool". A reader sees the old table or the new one, never a gap.
 * `routes` stays the SAME object (`callTool.ts` holds the reference).
 */
export async function refreshRoutes(): Promise<McpTool[]> {
  const next = new Map<string, { server: McpConnection; realName: string; annotations?: McpTool["annotations"] }>();
  const all: McpTool[] = [];
  // Evicting DURING iteration would re-enter `refreshRoutes`: collect, decide after.
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
    // The browser connector exposes ONLY the allow-listed tools: a package bump can't
    // silently surface a new exfil primitive.
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
    // The banner is the surface that TELLS the user about the failure.
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
