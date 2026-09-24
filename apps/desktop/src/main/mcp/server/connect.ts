
import { connectStdio } from "@openmasq/mcp/transport";
import { nodeSpawnFor } from "../nodeSpawn";
import { connectLocalFs } from "../../fs/connectLocalFs";
import {
  addServer,
  getServer,
  listServers,
  loadOAuth,
  loadSecrets,
  loadToken,
  removeServer,
  setPersistUser,
  type ServerSpec,
} from "../persist";
import { connectorConnect } from "../connectors";
import { healBrowserSpec } from "./browserSpecHeal";
import { blockedConnectorError, isConnectorBlocked } from "../orgPolicy";
import { e2eFilterServers, maybeRegisterE2eFixtureConnections } from "../e2eFixtures";
import { reportMainError } from "../../runtime/errorReport";
import {
  startAgentBrowser,
  stopAgentBrowser,
  agentBrowserRunning,
  agentBrowserEndpoint,
  setBrowserAgentEnabled,
  isBrowserAgentEnabled,
} from "../browser";
import { playwrightMcpSpawn } from "../browserTools";
import { buildEnv, getCatalogEntry, resolveParams } from "../catalog";
import {
  connected,
  emitNeedsReconnect,
  handleConnectorClosed,
  mcpCloseAll,
  mcpDisconnect,
  needsReconnect,
  refreshRoutes,
} from "./registry";
import { infoFor } from "./info";
import { withConnect } from "./connectCancel";
import { connectRemoteHttp } from "./connectRemote";
import { browserConnStale } from "./browserHeal";
import { reconnectRemoteWithRetry, shouldFlagForReconnect } from "./reconnectRetry";
import { BROWSER_ID, type McpServerInfo } from "./types";

/** Spawn a local stdio server from the catalog with its (decrypted) env. */
async function connectStdioServer(spec: ServerSpec): Promise<McpServerInfo> {
  const entry = spec.catalogId ? getCatalogEntry(spec.catalogId) : undefined;
  if (!entry) return { ...infoFor(spec), error: "unknown catalog entry" };
  const { env, missing } = buildEnv(entry, loadSecrets(spec.id));
  if (missing.length) return { ...infoFor(spec), error: `missing: ${missing.join(", ")}` };
  // Re-validate path grants at connect time (the directory may have moved/been deleted).
  const { args: pathArgs, errors } = resolveParams(entry, spec.params ?? {});
  if (errors.length) return { ...infoFor(spec), error: errors.join(", ") };
  // The filesystem entry runs IN-PROCESS (`../../fs/connectLocalFs.ts`).
  if (spec.catalogId === "filesystem") {
    try {
      connected.set(spec.id, connectLocalFs(spec.id, pathArgs));
      await refreshRoutes();
      return infoFor(spec);
    } catch (err) {
      return { ...infoFor(spec), error: err instanceof Error ? err.message : String(err) };
    }
  }
  try {
    // command + base args come ONLY from the vetted catalog entry; path args are
    // validated absolute directories; env is filtered; spawn is shell-less. `npx -y <pkg>`
    // is rewritten to run the BUNDLED package via Electron's Node.
    const spawn = nodeSpawnFor(entry.command, [...entry.args, ...pathArgs]);
    const conn = await connectStdio({
      id: spec.id,
      command: spawn.command,
      args: spawn.args,
      // The run-as-Node flag only when we rewrote the command to Electron's Node.
      env: spawn.env ? { ...env, ELECTRON_RUN_AS_NODE: "1" } : env,
      // A dead child is dropped, never re-probed.
      onClose: handleConnectorClosed,
    });
    connected.set(spec.id, conn);
    await refreshRoutes();
    return infoFor(spec);
  } catch (err) {
    return { ...infoFor(spec), error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The browser connector: `@playwright/mcp` pointed at the ISOLATED agent browser's CDP
 * endpoint (which exposes ONLY agent pages). Its tools register in `connected` like any
 * other, so redaction + routing + the write gate apply uniformly.
 */
async function connectBrowserServer(spec: ServerSpec): Promise<McpServerInfo> {
  try {
    const cdpEndpoint = await startAgentBrowser();
    // A stdio child that dies with the agent browser.
    const conn = await connectStdio({
      id: spec.id,
      ...playwrightMcpSpawn(cdpEndpoint),
      onClose: handleConnectorClosed,
    });
    connected.set(spec.id, conn);
    browserConnEndpoint = cdpEndpoint;
    await refreshRoutes();
    return infoFor(spec);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[browser] connect failed:", msg);
    return { ...infoFor(spec), error: msg };
  }
}

// The CDP endpoint the CONNECTED @playwright/mcp child was spawned against (read from env
// ONCE, at spawn: it can never follow a new endpoint).
let browserConnEndpoint: string | null = null;
let browserHeal: Promise<void> | null = null;

/**
 * Self-heal before a `browser__*` dispatch: the agent-browser child can die or be REPLACED
 * (new CDP endpoint) while the @playwright/mcp connection lives on. Drop the stale one and
 * reconnect.
 */
export async function ensureBrowserConnLive(): Promise<void> {
  if (!connected.has(BROWSER_ID)) return; // not connected → nothing to heal
  if (!browserConnStale(agentBrowserRunning(), agentBrowserEndpoint(), browserConnEndpoint)) return;
  return reconnectBrowserConn("stale CDP endpoint");
}

/**
 * Drop and reconnect @playwright/mcp (respawning the child if dead). Shared in-flight
 * promise: concurrent calls heal ONCE. A fresh connect re-enumerates live tabs.
 */
export async function reconnectBrowserConn(reason = "recover"): Promise<void> {
  if (!connected.has(BROWSER_ID)) return; // not connected → nothing to reconnect
  browserHeal ??= (async () => {
    try {
      console.error(`[browser] reconnecting @playwright/mcp (${reason})`);
      await mcpDisconnect(BROWSER_ID);
      if (getServer(BROWSER_ID)) await connectServer(BROWSER_ID, false);
    } finally {
      browserHeal = null;
    }
  })();
  return browserHeal;
}

/** Connect a persisted local-oauth spec (device flow if no stored token yet). */
async function connectDirectServer(spec: ServerSpec, interactive: boolean): Promise<McpServerInfo> {
  try {
    const conn = await connectorConnect(spec, interactive);
    connected.set(spec.id, conn);
    await refreshRoutes();
    // Re-read: connectorConnect may have persisted a fetched account label.
    return infoFor(getServer(spec.id) ?? spec);
  } catch (err) {
    return { ...infoFor(spec), connected: false, authorized: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Dispatch a connect by the spec's kind; a no-op when already connected. */
export async function connectServer(id: string, interactive: boolean): Promise<McpServerInfo> {
  const spec = getServer(id);
  if (!spec) {
    return { id, name: id, url: "", kind: "http", connected: false, authorized: false, error: "unknown server" };
  }
  if (connected.has(id)) {
    await refreshRoutes();
    return infoFor(spec);
  }
  if (spec.kind === "stdio") return connectStdioServer(spec);
  if (spec.kind === "local-oauth") return connectDirectServer(spec, interactive);
  if (spec.kind === "browser") return connectBrowserServer(spec);
  return connectRemoteHttp(spec, interactive);
}

export async function mcpConnect(id: string): Promise<McpServerInfo> {
  // Org policy, main-side: refuse before any OAuth window opens.
  if (isConnectorBlocked(id)) throw blockedConnectorError(id);
  // A cancellation scope so "Annuler" tears down the OAuth loopback (connectCancel.ts).
  return withConnect(id, () => connectServer(id, true));
}

/** Enable the browser connector: persist the opt-in + a `browser` spec, then connect. */
export async function mcpEnableBrowser(): Promise<McpServerInfo> {
  setBrowserAgentEnabled(true);
  addServer({
    id: BROWSER_ID,
    connectorId: BROWSER_ID,
    name: getServer(BROWSER_ID)?.name ?? "Navigateur",
    kind: "browser",
  });
  return connectServer(BROWSER_ID, true);
}

/** Disable + remove the browser connector and kill the agent-browser process. */
export async function mcpDisableBrowser(): Promise<void> {
  setBrowserAgentEnabled(false);
  await mcpDisconnect(BROWSER_ID);
  stopAgentBrowser();
  removeServer(BROWSER_ID);
  await refreshRoutes();
}

/**
 * Reconnect every persisted server that can come back WITHOUT user interaction (never a
 * login window). Best-effort: one that needs a fresh login stays disconnected.
 */
export async function mcpReconnectStored(): Promise<void> {
  // CONCURRENTLY: each connect is a full handshake, and serial would light connectors
  // up one by one. `e2eFilterServers` is identity in production.
  await Promise.allSettled(
    e2eFilterServers(listServers()).map(async (spec) => {
      if (connected.has(spec.id)) return;
      try {
        let last: McpServerInfo | undefined;
        if (spec.kind === "stdio") {
          await connectStdioServer(spec);
        } else if (spec.kind === "local-oauth") {
          if (loadToken(spec.id)) last = await connectDirectServer(spec, false);
        } else if (spec.kind === "browser") {
          // IF the user enabled it (the opt-in persists); the window spawns hidden.
          if (isBrowserAgentEnabled()) await connectBrowserServer(spec);
        } else if (loadOAuth(spec.id)?.tokens) {
          // Retry of the transient case only (reconnectRetry).
          last = await reconnectRemoteWithRetry(() => connectServer(spec.id, false), () => connected.has(spec.id));
        }
        if (shouldFlagForReconnect(last, connected.has(spec.id))) needsReconnect.add(spec.id);
      } catch (err) {
        // Best-effort, but surfaced so a silently-failing reconnect shows up.
        reportMainError("mcp", "reconnect", err);
      }
    }),
  );
  // E2E-only fixture connections (double env gate inside; inert in production).
  maybeRegisterE2eFixtureConnections(connected);
  await refreshRoutes();
  if (needsReconnect.size) emitNeedsReconnect(); // a single emission for the whole batch
}

/**
 * Re-scope ALL MCP state to a signed-in account: close every live connection, re-point
 * persistence, SILENTLY reconnect THAT account's servers. `null` = signed out ⇒ everything
 * dropped. Always ends by refreshing routes, so `mcp:changed` fires even for an empty scope.
 */
export async function setMcpUser(userId: string | null): Promise<void> {
  await mcpCloseAll();
  // The pending-reconnect set belonged to the previous account.
  needsReconnect.clear();
  emitNeedsReconnect();
  setPersistUser(userId);
  healBrowserSpec(userId); // a missing browser spec is recreated in the right scope
  await mcpReconnectStored();
}
