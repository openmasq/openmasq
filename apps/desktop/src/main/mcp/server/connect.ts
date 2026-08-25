
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
  // The filesystem catalog entry runs IN-PROCESS, not as a spawned server — the whole
  // decision (worker, deny set, live handle) lives in `../../fs/connectLocalFs.ts`.
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
    // validated absolute directories; env is filtered. Spawn is shell-less.
    // `npx -y <pkg>` is rewritten to run the BUNDLED package via Electron's Node
    // (no `npx` in a packaged app → `spawn npx ENOENT`); env from buildEnv wins.
    const spawn = nodeSpawnFor(entry.command, [...entry.args, ...pathArgs]);
    const conn = await connectStdio({
      id: spec.id,
      command: spawn.command,
      args: spawn.args,
      // Keep buildEnv's SANITIZED env; only add the run-as-Node flag when we rewrote
      // the command to Electron's Node (the npx passthrough keeps the plain env).
      env: spawn.env ? { ...env, ELECTRON_RUN_AS_NODE: "1" } : env,
      // Le processus enfant meurt : on le retire au lieu de continuer à le sonder.
      // Même câblage que le distant (`connectRemote.ts`) — il lui manquait ici.
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
 * Connect the controllable-browser connector: spawn `@playwright/mcp` and point it
 * at Electron's OWN Chromium via the runtime-resolved CDP endpoint. The spawned
 * server's tools (`browser_navigate/snapshot/click/type…`) register in `connected`
 * like any other, so redaction + routing + the write gate apply uniformly. Requires
 * the browser agent to be opted in AND the CDP endpoint open (a fresh opt-in needs
 * a restart — surfaced as BROWSER_RESTART_REQUIRED).
 */
async function connectBrowserServer(spec: ServerSpec): Promise<McpServerInfo> {
  try {
    // Spawn the ISOLATED agent-browser process (if not already up) and point
    // @playwright/mcp at its CDP endpoint — which exposes ONLY the agent page, so
    // targeting is deterministic and the app's own UI is never reachable.
    const cdpEndpoint = await startAgentBrowser();
    // `@playwright/mcp` est un enfant stdio, et il meurt avec le navigateur agent —
    // c'est LE serveur qui a produit la boucle « Not connected ».
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

// The CDP endpoint the CONNECTED @playwright/mcp child was spawned against. The child
// reads it from env ONCE, at spawn — it can never follow a new endpoint.
let browserConnEndpoint: string | null = null;
let browserHeal: Promise<void> | null = null;

/**
 * Self-heal the browser connector before a `browser__*` dispatch. The agent-browser
 * child can die or be REPLACED while the @playwright/mcp connection lives on: the main
 * window's `close` handler calls `stopAgentBrowser()` (macOS keeps the app alive), and
 * the human panel later respawns a NEW child with a NEW CDP endpoint + broker secret —
 * pwmcp still points at the dead one, so every navigation fails in ~10 ms with
 * "Target page, context or browser has been closed". When detected, drop the stale
 * pwmcp and reconnect (respawning the child if dead). Shared in-flight promise: heal once.
 */
export async function ensureBrowserConnLive(): Promise<void> {
  if (!connected.has(BROWSER_ID)) return; // not connected → nothing to heal
  if (!browserConnStale(agentBrowserRunning(), agentBrowserEndpoint(), browserConnEndpoint)) return;
  return reconnectBrowserConn("stale CDP endpoint");
}

/**
 * Drop the current @playwright/mcp connection and reconnect it — respawning the child if
 * it's simply dead. Shared in-flight promise so concurrent browser calls heal ONCE. Called
 * by {@link ensureBrowserConnLive} (stale endpoint, BEFORE dispatch) AND by `callTool.ts`
 * AFTER a recoverable-error dispatch (lost page / zero-tab `Target.createTarget` race,
 * `isRecoverableBrowserError`): a fresh connect re-enumerates live tabs so the retry finds one.
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

/**
 * Dispatch a connect by the spec's kind: stdio (re-spawn), local-oauth (on-device
 * OAuth), browser (agent Chromium), else the remote http+OAuth flow. A no-op when
 * already connected (just refreshes routes).
 */
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
  // Org policy, main-side (`../orgPolicy.ts`): refuse before any OAuth window opens, so a
  // blocked connector never reaches a consent screen the member cannot use anyway.
  if (isConnectorBlocked(id)) throw blockedConnectorError(id);
  // Interactive connect → run under a cancellation scope so "Annuler" can tear down
  // the OAuth loopback / device window (see connectCancel.ts). Keyed by `id`, which is
  // also what the renderer passes to `cancelConnect`.
  return withConnect(id, () => connectServer(id, true));
}

/**
 * Enable the controllable-browser connector: persist the opt-in flag + a `browser`
 * spec, then connect if the CDP endpoint is already open this session (env opt-in),
 * else report BROWSER_RESTART_REQUIRED so the UI prompts a relaunch.
 */
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

/** Disable + remove the browser connector: disconnect @playwright/mcp, kill the
 *  isolated agent-browser process, drop the spec + opt-in flag. */
export async function mcpDisableBrowser(): Promise<void> {
  setBrowserAgentEnabled(false);
  await mcpDisconnect(BROWSER_ID);
  stopAgentBrowser();
  removeServer(BROWSER_ID);
  await refreshRoutes();
}

/**
 * Reconnect every persisted server that can come back WITHOUT user interaction:
 * stdio servers (re-spawn) and http connectors that already hold OAuth tokens
 * (silent token use/refresh — never pops a login window). Called on app start so
 * connections survive a quit/relaunch. Best-effort: a server that needs a fresh
 * login is left disconnected for the user to reconnect manually.
 */
export async function mcpReconnectStored(): Promise<void> {
  // Reconnect every stored server CONCURRENTLY, not serially: each connect is a ~1-3s
  // handshake (OAuth token use, HTTP `initialize`+`listTools`, or a stdio spawn) firing
  // `mcp:changed` on completion, so a serial `await` loop lit connectors up ONE BY ONE
  // over N×~2-3s in Settings → MCP; in parallel they surface within ~one handshake.
  // Best-effort per server (`allSettled` — one failure never blocks the others).
  // `e2eFilterServers`: sous test seulement, un SOUS-ENSEMBLE (`OPENMASQ_E2E_MCP_ONLY`) — identité en production.
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
          // Re-connect the agent browser on startup IF the user enabled it (the opt-in flag
          // persists — survives a relaunch); its window spawns hidden (show:false) until opened.
          if (isBrowserAgentEnabled()) await connectBrowserServer(spec);
        } else if (loadOAuth(spec.id)?.tokens) {
          // Retry ciblé du transitoire (timeout de handshake sous charge) — cf. reconnectRetry.
          last = await reconnectRemoteWithRetry(() => connectServer(spec.id, false), () => connected.has(spec.id));
        }
        if (shouldFlagForReconnect(last, connected.has(spec.id))) needsReconnect.add(spec.id);
      } catch (err) {
        // Best-effort — the user can reconnect from Settings → MCP — but surface it
        // so a silently-failing startup reconnect shows up in error tracking.
        reportMainError("mcp", "reconnect", err);
      }
    }),
  );
  // E2E-only fixture connections (double env gate inside; inert in production —
  // never persisted, dropped by `mcpCloseAll` like any other, gates unweakened).
  maybeRegisterE2eFixtureConnections(connected);
  await refreshRoutes();
  if (needsReconnect.size) emitNeedsReconnect(); // une seule émission pour la volée
}

/**
 * Re-scope ALL MCP state to a signed-in account (privacy isolation, mirrors the
 * per-account DB `setDbUser`). Closes every live connection + clears the in-memory maps,
 * re-points persistence at the account's own `mcp.json`, then SILENTLY reconnects THAT
 * account's stored servers (no login popups). `null` = signed out → every connector is
 * dropped and nothing is reconnected. Driven by the renderer on sign-in / account switch /
 * sign-out (IPC `mcp:set-user`), alongside `db:set-user`. Always ends by refreshing routes,
 * so the renderer's `mcp:changed` fires even when the new scope is empty.
 */
export async function setMcpUser(userId: string | null): Promise<void> {
  await mcpCloseAll();
  // The pending-reconnect set belonged to the previous account — drop it (and clear
  // the banner) before reconnecting the new scope.
  needsReconnect.clear();
  emitNeedsReconnect();
  setPersistUser(userId);
  healBrowserSpec(userId); // spec navigateur manquant → recréé dans le bon scope (le pourquoi : ./browserSpecHeal.ts)
  // Reconnects the new scope's servers AND calls refreshRoutes() (→ mcp:changed) even for
  // an empty scope, so the UI drops the previous account's connectors immediately.
  await mcpReconnectStored();
}
