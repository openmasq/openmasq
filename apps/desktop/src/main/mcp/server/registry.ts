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

/** Retire un connecteur mort du jeu vif, SANS rebâtir les routes ni notifier — la moitié
 *  que `refreshRoutes` peut appeler depuis sa propre boucle sans se ré-entrer. */
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
 *  a no-op. Câblé sur les DEUX transports : `connectRemote.ts` (HTTP) et `connect.ts`
 *  (stdio — l'enfant `@playwright/mcp` du navigateur agent). */
export function handleConnectorClosed(id: string): void {
  if (!connected.has(id)) return;
  evictConnector(id);
  void refreshRoutes();
  emitNeedsReconnect();
}

/**
 * Re-list tools from every connected server, rebuilding the routing table.
 *
 * ⚠️ Un serveur dont `listTools` échoue sur un transport MORT est ÉVINCÉ, pas seulement
 * signalé. Avant, on posait son compteur à 0, on rapportait, et on le laissait dans
 * `connected` : le rafraîchissement suivant le re-sondait et le re-rapportait, donc une
 * seule mort produisait un rapport par tick, indéfiniment (848 événements Sentry en huit
 * jours pour UN enfant `@playwright/mcp` disparu). `onClose` couvre la mort qui s'annonce ;
 * ceci couvre celle qu'on découvre en appelant — et les deux mènent au même endroit.
 *
 * ⚠️ **La table se construit À CÔTÉ, puis bascule d'un coup.** Un `routes.clear()` en tête
 * la laissait VIDE pendant tous les `await listTools()` — un aller-retour réseau par
 * serveur connecté. Tout appel d'outil tombant dans cette fenêtre ne trouvait pas sa route
 * et mourait sur « Unknown MCP tool », alors que l'outil existait : mesuré le 15/08, trois
 * appels parallèles au MÊME outil, deux passés, un tué. Pire, deux rafraîchissements
 * concurrents se vidaient mutuellement la table qu'ils venaient de remplir. On ne publie
 * donc que le résultat COMPLET, et la bascule est synchrone (aucun `await` entre le vidage
 * et le remplissage) : un lecteur voit l'ancienne table ou la nouvelle, jamais un trou.
 * `routes` reste le MÊME objet — `callTool.ts` en tient la référence.
 */
export async function refreshRoutes(): Promise<McpTool[]> {
  const next = new Map<string, { server: McpConnection; realName: string; annotations?: McpTool["annotations"] }>();
  const all: McpTool[] = [];
  // Évincer PENDANT l'itération rappellerait `refreshRoutes` par `handleConnectorClosed` :
  // on récolte, on tranche après la boucle.
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
  // LA BASCULE — synchrone, sans `await` intercalé (voir l'en-tête).
  routes.clear();
  for (const [name, route] of next) routes.set(name, route);
  if (dead.length) {
    for (const id of dead) evictConnector(id);
    // La bannière « reconnexion nécessaire » est la surface qui DIT la panne à
    // l'utilisateur — c'est elle qui rend le silence de Sentry acceptable.
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
