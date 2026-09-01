/**
 * Pure merge semantics for the record channel (v2). A conversation is an
 * append-only oplog of records; merging two devices' histories is therefore
 * mostly a UNION — the only decisions are per-entity:
 *
 *   - `message`   — union by entityId, LWW on an EDIT (a duplicate re-push of
 *                   the same recordId keeps ONE record; an edited version rides
 *                   a NEW recordId on the same entityId and the newest wins —
 *                   `convSync.ts` owns when an edit re-emits).
 *   - `convMeta`  — one entity per conversation ("meta"); last-write-wins by
 *                   (lamport, deviceId) — Lamport clocks, never wall clocks.
 *   - `integration` — LWW per integration id (the directory: connector +
 *                   account + settings; credentials never ride here).
 *   - `userdata`  — LWW per entity (skills / workflows / memory —
 *                   `userdata.ts` owns the allow-listed payloads).
 *   - `coffre`    — LWW per entity (the always-redacted terms — `coffre.ts`
 *                   owns the allow-listed payload; rides the `@coffre` scope).
 *   - tombstones  — delete their entity when their lamport is ≥ the entity's;
 *                   a `convTombstone` marks the WHOLE conversation deleted.
 *                   Tombstones are KEPT after applying (a device that syncs
 *                   later must still see the deletion).
 *
 * Everything here is payload-agnostic: records are opaque envelopes to this
 * package (the canonical chat shapes live in `@openmasq/schema`).
 */
import type { SyncRecord } from "./types";

/** Deterministic total order: lamport, then deviceId as the tie-break. */
export function compareRecords(a: SyncRecord, b: SyncRecord): number {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport;
  return a.deviceId < b.deviceId ? -1 : a.deviceId > b.deviceId ? 1 : 0;
}

/** The next local Lamport value after observing `records` (max(seen, local)+1). */
export function nextLamport(records: SyncRecord[], local: number): number {
  let max = local;
  for (const r of records) if (r.lamport > max) max = r.lamport;
  return max + 1;
}

/**
 * Merge two record sets into one canonical history:
 *  1. union by `recordId` (idempotent re-pushes collapse);
 *  2. per (kind-family, entityId), keep the LWW winner — for EVERY kind,
 *     messages included (an edited message is a newer record on its entityId);
 *  3. tombstones survive the merge (they must propagate to late devices).
 * The result is sorted by {@link compareRecords}.
 */
export function mergeRecords(a: SyncRecord[], b: SyncRecord[]): SyncRecord[] {
  const byRecordId = new Map<string, SyncRecord>();
  for (const r of [...a, ...b]) if (!byRecordId.has(r.recordId)) byRecordId.set(r.recordId, r);

  // Collapse per entity: several records may target the same entity (an edit,
  // a meta change) — keep the newest, whatever the kind.
  const byEntity = new Map<string, SyncRecord>();
  for (const r of byRecordId.values()) {
    const key = `${r.kind}:${r.entityId}`;
    const cur = byEntity.get(key);
    if (!cur || compareRecords(r, cur) > 0) byEntity.set(key, r);
  }
  return [...byEntity.values()].sort(compareRecords);
}

/** The LIVE view of a merged history: tombstones applied. `deleted` = the whole
 *  conversation is tombstoned (the caller purges local + server state). */
export interface LiveConversation {
  deleted: boolean;
  meta?: SyncRecord;
  /** Ordered by (lamport, deviceId) — the cross-device message order. */
  messages: SyncRecord[];
  integrations: SyncRecord[];
  /** Live `userdata` entities (their tombstones applied, same resurrect rule). */
  userdata: SyncRecord[];
  /** Live `coffre` entities (their tombstones applied, same resurrect rule). */
  coffre: SyncRecord[];
}

export function liveView(merged: SyncRecord[]): LiveConversation {
  const convTomb = merged.find((r) => r.kind === "convTombstone");
  if (convTomb) return { deleted: true, messages: [], integrations: [], userdata: [], coffre: [] };

  const intTombs = new Map<string, SyncRecord>();
  const udTombs = new Map<string, SyncRecord>();
  const cfTombs = new Map<string, SyncRecord>();
  for (const r of merged) {
    if (r.kind === "integrationTombstone") intTombs.set(r.entityId, r);
    else if (r.kind === "userdataTombstone") udTombs.set(r.entityId, r);
    else if (r.kind === "coffreTombstone") cfTombs.set(r.entityId, r);
  }

  const messages: SyncRecord[] = [];
  const integrations: SyncRecord[] = [];
  const userdata: SyncRecord[] = [];
  const vaultTerms: SyncRecord[] = [];
  let meta: SyncRecord | undefined;
  for (const r of merged) {
    if (r.kind === "message") messages.push(r);
    else if (r.kind === "convMeta") meta = r; // merged is sorted → last wins
    else if (r.kind === "integration") {
      const tomb = intTombs.get(r.entityId);
      // The tombstone deletes the integration unless the integration record is
      // strictly NEWER (a re-connect after a disconnect resurrects it).
      if (!tomb || compareRecords(r, tomb) > 0) integrations.push(r);
    } else if (r.kind === "userdata") {
      const tomb = udTombs.get(r.entityId);
      // Same rule: an edit strictly newer than the delete resurrects the entity.
      if (!tomb || compareRecords(r, tomb) > 0) userdata.push(r);
    } else if (r.kind === "coffre") {
      const tomb = cfTombs.get(r.entityId);
      if (!tomb || compareRecords(r, tomb) > 0) vaultTerms.push(r);
    }
  }
  return { deleted: false, meta, messages, integrations, userdata, coffre: vaultTerms };
}
