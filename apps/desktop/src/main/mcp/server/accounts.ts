import { connectorIdFromInstance } from "@openmasq/catalog/mcp";
import { remoteAccountIdentity, accountKeyHash } from "../accountIdentity";
import { addServer, getServer, listServers, loadOAuth, type ServerSpec } from "../persist";
import { connected } from "./registry";

// All Google connectors (Gmail, Calendar, Drive…) can share ONE Google "Desktop
// app" OAuth client — scopes are requested per-connector via incremental consent,
// only each service's API must be enabled separately. So BYO creds entered for one
// Google connector are REUSED by the others; `credGroupOf` maps a connector to its
// shared credential group ("google"), other connectors stay per-id (no sharing).
export function credGroupOf(id: string): string {
  const cid = connectorIdFromInstance(id);
  // Google connectors share ONE "Desktop app" client; Microsoft connectors share ONE
  // public "Desktop app" client too — so BYO creds entered for one are reused by the
  // others in the same group. Everything else stays per-id (no sharing).
  if (/^(gmail|google-)/.test(cid)) return "google";
  if (/^microsoft-/.test(cid)) return "microsoft";
  return cid;
}

/** The catalog connector a (possibly multi-account) spec is an instance of. */
export const connectorIdOf = (spec: ServerSpec): string =>
  spec.connectorId ?? connectorIdFromInstance(spec.id);

/** Best-effort: stamp a REMOTE instance's stable identity (`accountKey`) + real
 *  label from the provider once, using its stored OAuth access token. Idempotent
 *  (skips when already known); failures are silent (no identity ⇒ no dedupe). */
export async function maybeStoreRemoteIdentity(id: string, spec: ServerSpec): Promise<void> {
  if (spec.accountKey) return;
  const cid = connectorIdOf(spec);
  const ident = await remoteAccountIdentity(cid, loadOAuth(id)?.tokens);
  if (!ident) return;
  const current = getServer(id) ?? spec;
  addServer({ ...current, accountKey: accountKeyHash(cid, ident.key), label: ident.label ?? current.label });
}

/**
 * The existing connection that resolves to the SAME account as `instanceId` (same
 * connector + same `accountKey`), or undefined. Backfills a still-connected remote
 * sibling's identity on demand so an OLDER account (connected before this feature)
 * still dedupes against a freshly-added same account. Async (may fetch identity).
 */
export async function duplicateInstance(
  connectorId: string,
  instanceId: string,
): Promise<ServerSpec | undefined> {
  const me = getServer(instanceId);
  if (!me?.accountKey) return undefined;
  for (const s of listServers()) {
    if (s.id === instanceId || connectorIdOf(s) !== connectorId) continue;
    let key = s.accountKey;
    if (!key && s.kind === "http" && connected.has(s.id)) {
      const ident = await remoteAccountIdentity(connectorId, loadOAuth(s.id)?.tokens);
      if (ident) {
        key = accountKeyHash(connectorId, ident.key);
        addServer({ ...s, accountKey: key, label: ident.label ?? s.label });
      }
    }
    if (key && key === me.accountKey) return s;
  }
  return undefined;
}

/** The BYO client id/secret already stored for ANY connector in the same group —
 *  so a second Google connector reuses them instead of asking the user again. */
export function groupCreds(group: string): { clientId?: string; clientSecret?: string } | undefined {
  for (const s of listServers()) {
    if (s.credMode === "byo" && s.clientId && credGroupOf(connectorIdOf(s)) === group) {
      return { clientId: s.clientId, clientSecret: s.clientSecret };
    }
  }
  return undefined;
}

/** Credential groups that currently have BYO creds stored (e.g. ["google"]) — lets
 *  the UI show "déjà enregistré" on a Google connector the user hasn't opened yet. */
export function mcpByoCredGroups(): string[] {
  const groups = new Set<string>();
  for (const s of listServers()) {
    if (s.credMode === "byo" && s.clientId) groups.add(credGroupOf(connectorIdOf(s)));
  }
  return [...groups];
}
