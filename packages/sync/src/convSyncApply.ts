/**
 * The RECEIVING side of the conversation⇄record translation — apply a pull to
 * the local conversation and absorb it into the ledger. Split from `convSync.ts`
 * (the emit side, which owns the ledger shape + payload allow-list) purely for
 * rule 1; the two halves share `msgSigOf`/`metaSigOf` so emit and absorb can
 * never disagree on what "unchanged" means.
 */
import type { Conversation, Message } from "@openmasq/schema";
import { compareRecords, liveView, mergeRecords } from "./records";
import type { LiveConversation } from "./records";
import type { SyncRecord } from "./types";
import {
  metaSigOf,
  msgSigOf,
  toSyncedMessage,
  type ConvSyncState,
  type SyncedConvMeta,
  type SyncedMessage,
} from "./convSync";

/** The outcome of applying a pull to a local conversation. */
export type ApplyOutcome =
  | { kind: "none" }
  | { kind: "delete" }
  | { kind: "upsert"; conv: Conversation };

/**
 * Merge pulled records into the local conversation (pure). Messages union by
 * id — the LOCAL order is preserved, unseen remote messages are appended in
 * their (lamport, deviceId) order; a pulled EDIT of a known message replaces
 * its synced fields UNLESS the local copy is itself dirty (its sig differs
 * from `knownSigs`' last pushed/pulled version — the uncommitted local edit
 * survives and pushes next cycle, the userdata rule); meta applies LWW; a
 * convTombstone deletes. `now` stamps `updatedAt` (no clock in here).
 */
export function applyPulled(
  existing: Conversation | undefined,
  convId: string,
  pulled: SyncRecord[],
  now: number,
  knownSigs?: Record<string, string>,
): ApplyOutcome {
  if (!pulled.length) return { kind: "none" };
  const live: LiveConversation = liveView(mergeRecords([], pulled));
  if (live.deleted) return existing ? { kind: "delete" } : { kind: "none" };

  const meta = live.meta?.payload as SyncedConvMeta | undefined;
  const localIds = new Set((existing?.messages ?? []).map((m) => m.id));
  const fresh: Message[] = [];
  const updates = new Map<string, SyncedMessage>();
  for (const r of live.messages) {
    const p = r.payload as SyncedMessage;
    if (!p?.id) continue;
    if (localIds.has(p.id)) {
      updates.set(p.id, p);
      continue;
    }
    localIds.add(p.id);
    const m: Message = { id: p.id, role: p.role, content: p.content };
    if (p.modelContent !== undefined) m.modelContent = p.modelContent;
    if (p.incomplete) m.incomplete = true;
    fresh.push(m);
  }

  // Apply remote edits onto known messages, keeping every local-only field
  // (attachments, redactions…). Skipped when identical, or when the LOCAL copy
  // carries an unpushed edit (dirty vs the ledger sig) — never clobber it.
  let edited = false;
  const mergedMessages = (existing?.messages ?? []).map((m) => {
    const p = updates.get(m.id);
    if (!p) return m;
    const localSynced = toSyncedMessage(m);
    if (msgSigOf(p) === msgSigOf(localSynced)) return m;
    const lastKnown = knownSigs?.[m.id];
    const locallyDirty = lastKnown !== undefined && msgSigOf(localSynced) !== lastKnown;
    if (locallyDirty) return m;
    edited = true;
    const next: Message = { ...m, content: p.content };
    if (p.modelContent !== undefined) next.modelContent = p.modelContent;
    if (p.incomplete) next.incomplete = true;
    else delete next.incomplete;
    return next;
  });

  if (!fresh.length && !meta && !edited) return { kind: "none" };

  const base: Conversation =
    existing ??
    ({
      id: convId,
      title: meta?.title ?? "",
      modelId: meta?.modelId ?? "",
      messages: [],
      createdAt: meta?.createdAt ?? now,
      updatedAt: now,
    } as Conversation);

  return {
    kind: "upsert",
    conv: {
      ...base,
      title: meta?.title ?? base.title,
      modelId: meta?.modelId ?? base.modelId,
      messages: [...(existing ? mergedMessages : base.messages), ...fresh],
      updatedAt: now,
    },
  };
}

/**
 * Absorb a pull into the ledger: advance the conversation's `seq` cursor and
 * mark pulled message ids + meta as known — WITH the sig of each message's LWW
 * winner — so this device never ECHOES back what it just received (an applied
 * edit matches its recorded sig; only a genuinely new local edit re-emits).
 */
export function absorbPulled(
  state: ConvSyncState,
  convId: string,
  seq: number,
  pulled: SyncRecord[],
): ConvSyncState {
  const entry = state.convs[convId] ?? { seq: 0, msgIds: [] };
  const known = new Set(entry.msgIds);
  const msgSigs = { ...(entry.msgSigs ?? {}) };
  let metaSig = entry.metaSig;
  let lamport = state.lamport;
  // Per-message LWW winner among the pulled records — its sig is the version the
  // ledger must remember (a stale loser's sig would mark the applied winner dirty).
  const winners = new Map<string, SyncRecord>();
  for (const r of pulled) {
    if (r.lamport > lamport) lamport = r.lamport; // Lamport: max(seen, local)
    if (r.kind === "message") {
      const id = (r.payload as SyncedMessage)?.id;
      if (!id) continue;
      known.add(id);
      const cur = winners.get(id);
      if (!cur || compareRecords(r, cur) > 0) winners.set(id, r);
    } else if (r.kind === "convMeta") {
      metaSig = metaSigOf(r.payload as SyncedConvMeta);
    }
  }
  for (const [id, r] of winners) msgSigs[id] = msgSigOf(r.payload as SyncedMessage);
  return {
    ...state,
    lamport,
    convs: {
      ...state.convs,
      [convId]: { ...entry, seq: Math.max(entry.seq, seq), msgIds: [...known], metaSig, msgSigs },
    },
  };
}
