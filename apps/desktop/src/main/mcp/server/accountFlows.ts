import { randomUUID } from "node:crypto";
import { addServer, clearToken, getServer, listServers, saveApiKey, type ServerSpec } from "../persist";
import { connectServer } from "./connect";
import { withConnect } from "./connectCancel";
import { credGroupOf, connectorIdOf, groupCreds, duplicateInstance } from "./accounts";
import { mcpRemove } from "./lifecycle";
import { mcpDisconnect } from "./registry";
import { infoFor } from "./info";
import type { McpServerInfo } from "./types";
import type { CredMode } from "../credMode";

/** Connect a freshly-minted account instance, then DEDUPE: if it resolves to an
 *  already-connected account, drop the new instance and return the existing one
 *  flagged "déjà connecté" (so re-consenting on the SAME account can't duplicate it). */
async function connectNewAccount(connectorId: string, instanceId: string): Promise<McpServerInfo> {
  const info = await connectServer(instanceId, true);
  const dup = await duplicateInstance(connectorId, instanceId);
  if (dup) {
    await mcpRemove(instanceId);
    return { ...infoFor(dup), error: "Ce compte est déjà connecté." };
  }
  return info;
}

/**
 * Connect a DESKTOP-DIRECT connector (github today): OAuth on-device + tools run
 * in-process (`@openmasq/connectors`), NO broker. Persists a `local-oauth` spec
 * (so it lists + silently reconnects on relaunch), then connects interactively.
 * `clientId` is the user's PUBLIC client id in `byo` mode (never a secret).
 */
export async function mcpConnectDirect(
  id: string,
  opts: { mode: CredMode; clientId?: string; clientSecret?: string },
): Promise<McpServerInfo> {
  const existing = getServer(id);
  // BYO only: reuse creds from a sibling connector in the same group (Google).
  const shared = opts.mode === "byo" ? groupCreds(credGroupOf(id)) : undefined;
  const spec: ServerSpec = {
    id,
    // The primary account's instance id IS the connector id.
    connectorId: id,
    name: existing?.name ?? id,
    label: existing?.label,
    kind: "local-oauth",
    credMode: opts.mode,
    // Blank fields fall back to this connector's own stored creds, THEN (for BYO) to
    // any sibling in the same credential group — so a 2nd Google connector reuses the
    // keys already entered for the 1st. `||` (not `??`) so an empty string falls through.
    clientId: opts.clientId?.trim() || existing?.clientId || shared?.clientId,
    clientSecret: opts.clientSecret?.trim() || existing?.clientSecret || shared?.clientSecret,
  };
  addServer(spec);
  return withConnect(id, () => connectServer(id, true));
}

/**
 * Connect an ADDITIONAL account of a desktop-direct connector (multi-account).
 * Mints a fresh instance id `${connectorId}--${suffix}` so its token + tools live
 * alongside the existing account(s); the connector definition is resolved from
 * `connectorId`. BYO creds are reused from a same-group sibling (Google), so a 2nd
 * Google account never re-enters keys. The real account label (email / login) is
 * filled in by the connect flow; until then it shows "Compte N".
 */
export async function mcpAddAccountDirect(
  connectorId: string,
  opts: { mode: CredMode; clientId?: string; clientSecret?: string },
): Promise<McpServerInfo> {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 6);
  const instanceId = `${connectorId}--${suffix}`;
  const base = getServer(connectorId);
  const shared = opts.mode === "byo" ? groupCreds(credGroupOf(connectorId)) : undefined;
  const n = listServers().filter((s) => connectorIdOf(s) === connectorId).length + 1;
  const spec: ServerSpec = {
    id: instanceId,
    connectorId,
    name: base?.name ?? connectorId,
    label: `Compte ${n}`,
    kind: "local-oauth",
    credMode: opts.mode,
    clientId: opts.clientId?.trim() || shared?.clientId,
    clientSecret: opts.clientSecret?.trim() || shared?.clientSecret,
  };
  addServer(spec);
  // Scope keyed by the CONNECTOR id (what the card + renderer cancel by), even though a
  // fresh instance id is minted — the ambient signal flows into `connectServer` regardless.
  return withConnect(connectorId, () => connectNewAccount(connectorId, instanceId));
}

/**
 * Multi-account for REMOTE connectors: mint a fresh instance of a remote connector
 * (OAuth preset / custom URL / API-key) and connect it. `url` defaults to the
 * primary's/preset's URL; a header-auth `apiKey` (Fireflies) is stored ENCRYPTED
 * PER INSTANCE; a query-param key (Exa/Tavily) is already baked into `url` by the UI.
 */
export async function mcpAddAccountRemote(
  connectorId: string,
  opts: { url?: string; name?: string; apiKey?: string } = {},
): Promise<McpServerInfo> {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 6);
  const instanceId = `${connectorId}--${suffix}`;
  const base = getServer(connectorId);
  const n = listServers().filter((s) => connectorIdOf(s) === connectorId).length + 1;
  const spec: ServerSpec = {
    id: instanceId,
    connectorId,
    name: opts.name ?? base?.name ?? connectorId,
    label: `Compte ${n}`,
    kind: "http",
    url: opts.url ?? base?.url ?? "",
  };
  if (opts.apiKey?.trim()) saveApiKey(instanceId, opts.apiKey.trim());
  addServer(spec);
  return withConnect(connectorId, () => connectNewAccount(connectorId, instanceId));
}

/** Force a FRESH OAuth for a desktop-direct connector: drop the stored token
 *  (keeping the spec + its BYO client id/secret) then re-connect interactively,
 *  so a stale / wrong-scope token (e.g. minted before a scope was added → 403) is
 *  replaced by a fresh consent — without the user re-entering their keys. */
export async function mcpReauthDirect(id: string): Promise<McpServerInfo> {
  const spec = getServer(id);
  if (!spec || spec.kind !== "local-oauth") {
    return { id, name: id, url: "", kind: "local-oauth", connected: false, authorized: false, error: "connecteur inconnu" };
  }
  await mcpDisconnect(id);
  clearToken(id);
  return withConnect(id, () => connectServer(id, true));
}
