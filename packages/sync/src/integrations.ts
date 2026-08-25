/**
 * The synced integrations DIRECTORY (pure). What syncs is CONFIG ONLY — which
 * connectors are connected, on which account label, of what kind — as an
 * ALLOW-LISTED payload. Credentials NEVER ride these records: no OAuth token
 * (per-device grants — refresh-token rotation races + blast radius), no API
 * key, and deliberately NO URL either (an API-key connector's URL can embed a
 * query-param key). The receiving device shows "Connecter sur cet appareil"
 * and runs its OWN OAuth/key flow.
 *
 * Records ride the reserved {@link INTEGRATIONS_SCOPE} conversation of the
 * record channel: `integration` (LWW per instance id) + `integrationTombstone`
 * (a disconnect). Same E2E envelope, same server blindness.
 */
import { liveView, mergeRecords } from "./records";
import type { SyncRecord } from "./types";

/** One connected integration, as the directory sees it. `id` is the INSTANCE
 *  (multi-account: one per account); `connectorId` the catalog connector. */
export interface SyncedIntegration {
  id: string;
  connectorId: string;
  name: string;
  kind: string;
  /** Human account label (email / "Compte N") — display only. */
  label?: string;
}

/** Per-account emission ledger (persisted by the app; nothing sensitive). */
export interface IntegrationSyncState {
  accountId: string;
  lamport: number;
  /** Instance id → signature of what was last emitted for it. */
  sigs: Record<string, string>;
}

export const emptyIntegrationSyncState = (accountId: string): IntegrationSyncState => ({
  accountId,
  lamport: 0,
  sigs: {},
});

const sigOf = (i: SyncedIntegration): string => `${i.connectorId} ${i.name} ${i.kind} ${i.label ?? ""}`;

/** Records to push for the CURRENT locally-connected set: an `integration` for
 *  each new/changed instance, an `integrationTombstone` for each disconnected
 *  one. Diffs against the ledger — an unchanged set emits nothing. */
export function emitIntegrationRecords(
  current: SyncedIntegration[],
  state: IntegrationSyncState,
  deviceId: string,
): { records: SyncRecord[]; state: IntegrationSyncState } {
  let lamport = state.lamport;
  const records: SyncRecord[] = [];
  const sigs = { ...state.sigs };

  for (const raw of current) {
    // ALLOW-LIST re-build: whatever extra fields the caller's object carries
    // (urls, tokens, errors) can never leak into the payload by spread.
    const entry: SyncedIntegration = {
      id: raw.id,
      connectorId: raw.connectorId,
      name: raw.name,
      kind: raw.kind,
      ...(raw.label ? { label: raw.label } : {}),
    };
    const sig = sigOf(entry);
    if (sigs[entry.id] === sig) continue;
    lamport += 1;
    records.push({
      recordId: `int:${entry.id}:${lamport}:${deviceId}`,
      entityId: entry.id,
      kind: "integration",
      lamport,
      deviceId,
      payload: entry,
    });
    sigs[entry.id] = sig;
  }

  const currentIds = new Set(current.map((i) => i.id));
  for (const id of Object.keys(sigs)) {
    if (currentIds.has(id)) continue;
    lamport += 1;
    records.push({
      recordId: `intdel:${id}:${lamport}:${deviceId}`,
      entityId: id,
      kind: "integrationTombstone",
      lamport,
      deviceId,
      payload: {},
    });
    delete sigs[id];
  }

  if (!records.length) return { records, state };
  return { records, state: { ...state, lamport, sigs } };
}

/** The LIVE directory from pulled records (tombstones applied; a re-connect
 *  newer than its tombstone resurrects — `records.ts` owns that rule). */
export function applyIntegrationRecords(pulled: SyncRecord[]): SyncedIntegration[] {
  return liveView(mergeRecords([], pulled))
    .integrations.map((r) => r.payload as SyncedIntegration)
    .filter((p) => !!p?.id && !!p.connectorId);
}
