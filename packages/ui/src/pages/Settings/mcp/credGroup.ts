import { connectorIdFromInstance } from "@openmasq/catalog/mcp";
import type { McpItem } from "./mcpItems";

/**
 * The GROUP of a connector's credentials — i.e. what falls together.
 *
 * Google connectors (Gmail, Agenda, Drive, Docs, Sheets, Tasks, Analytics) share
 * ONE SINGLE "Desktop app" OAuth client, so a single authorization on Google's side. They
 * share the "google" group and lend each other their keys; every other connector is its
 * own group.
 *
 * ⚠️ **The failure is group-wide, the repair is not.** `mcpReauthDirect` (main)
 * purges and re-consents ONE id: `clearToken(id)` then `connectServer(id)`. When
 * Google authorization expires or is revoked, the seven connectors fall together,
 * but reconnecting Gmail only refreshes Gmail — Agenda and Drive stay broken, and
 * nothing said so. Hence `groupPeers`: the card NAMES the others and offers to
 * reconnect them too.
 *
 * Why not re-consent everything in one gesture (the other option considered): Google
 * would then ask for consent for the UNION of the seven services' scopes, over
 * RESTRICTED scopes. Fixing your mail should not require granting Drive.
 */
export function credGroupOf(id: string): string {
  const connectorId = connectorIdFromInstance(id);
  return /^(gmail|google-)/.test(connectorId) ? "google" : connectorId;
}

/** True when the group can contain SEVERAL connectors (today: Google only).
 *  A single-connector group has nothing to announce. */
export function isSharedCredGroup(id: string): boolean {
  return credGroupOf(id) !== connectorIdFromInstance(id);
}

/**
 * The OTHER connectors in the same credential group, among those the user has
 * actually connected — these are the ones the same authorization took down.
 *
 * Bounded to what is CONNECTED: naming a service the user doesn't use
 * would turn a repair into a catalogue. And the order follows `items`, i.e. the
 * catalogue's order, so the sentence stays stable from one opening to the next.
 */
export function groupPeers(id: string, items: readonly McpItem[]): McpItem[] {
  const connectorId = connectorIdFromInstance(id);
  if (!isSharedCredGroup(connectorId)) return [];
  const group = credGroupOf(connectorId);
  return items.filter((it) => it.id !== connectorId && it.connected && credGroupOf(it.id) === group);
}
