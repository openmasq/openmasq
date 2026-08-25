/**
 * Desktop orchestration of the RECORD channel (conversations). The decisions —
 * what to emit, how to merge back — live in `@openmasq/sync` `convSync`
 * (pure, tested, shared with mobile); this file only persists the per-account
 * ledger (localStorage: cursors + pushed ids, nothing sensitive) and drives
 * the store.
 *
 * Serialised through one promise chain: push and pull both read-modify-write
 * the ledger, and two overlapping cycles would lose updates.
 *
 * Deletion propagates as a TOMBSTONE record (nothing sensitive in it). The
 * conversation's encrypted records stay server-side so late devices still see
 * the tombstone — purging them after propagation needs an ack/retention story
 * (follow-up); the explicit DELETE endpoint remains for a future "supprimer
 * partout maintenant".
 */
import Debug from "debug";
import { BRAND } from "@openmasq/branding";
import type { Conversation } from "@openmasq/ui";
import {
  absorbPulled,
  applyPulled,
  emitConvRecords,
  emitDeletions,
  emptyConvSyncState,
  type ConvSyncState,
} from "@openmasq/sync";
import { authHost } from "../auth";
import { recordSync, syncDeviceId } from "./client";

const debug = Debug("openmasq:sync");

const stateKey = (accountId: string) => `${BRAND.slug}:conv-sync:${accountId}`;

function loadState(accountId: string): ConvSyncState {
  try {
    const raw = localStorage.getItem(stateKey(accountId));
    if (raw) {
      const s = JSON.parse(raw) as ConvSyncState;
      if (s.accountId === accountId) return s;
    }
  } catch {
    /* corrupted ledger → start fresh (worst case: an idempotent re-push) */
  }
  return emptyConvSyncState(accountId);
}

function saveState(state: ConvSyncState): void {
  try {
    localStorage.setItem(stateKey(state.accountId), JSON.stringify(state));
  } catch {
    /* best-effort */
  }
}

// One cycle at a time — push and pull both read-modify-write the ledger.
let chain: Promise<void> = Promise.resolve();
function serial(fn: () => Promise<void>): Promise<void> {
  chain = chain.then(fn, fn);
  return chain;
}

async function accountId(): Promise<string | null> {
  const user = await authHost.getSession().catch(() => null);
  return user?.id ?? null;
}

/** Push the delta of every conversation (new final messages, meta changes) and
 *  tombstone local deletions. Ledger advances ONLY on a successful push. */
export function pushConvRecords(convs: Conversation[]): Promise<void> {
  return serial(async () => {
    const rs = recordSync();
    if (!rs) return;
    const account = await accountId();
    if (!account) return;
    const devId = syncDeviceId();
    let state = loadState(account);

    for (const c of convs) {
      const { records, state: next } = emitConvRecords(c, state, devId);
      if (!records.length) continue;
      const pushed = await rs.push(c.id, records);
      if (pushed > 0) {
        debug("convSync push %d record(s)", pushed);
        state = next;
        saveState(state);
      }
    }

    const { tombstones, state: afterDel } = emitDeletions(
      new Set(convs.map((c) => c.id)),
      state,
      devId,
    );
    for (const t of tombstones) {
      const ok = await rs.push(t.convId, [t.record]);
      debug("convSync tombstone %s", ok > 0 ? "pushed" : "skipped");
    }
    if (tombstones.length) saveState(afterDel);
  });
}

/** Pull every changed conversation since the global cursor and merge it into
 *  the store (`apply`). Pulled records are absorbed into the ledger so this
 *  device never echoes them back. */
export function pullConvRecords(
  getExisting: (convId: string) => Conversation | undefined,
  apply: (convId: string, conv: Conversation | null) => void,
): Promise<void> {
  return serial(async () => {
    const rs = recordSync();
    if (!rs) return;
    const account = await accountId();
    if (!account) return;
    let state = loadState(account);

    const { convIds, cursor } = await rs.changed(state.global);
    for (const convId of convIds) {
      const since = state.convs[convId]?.seq ?? 0;
      const { records, seq } = await rs.pull(convId, since);
      if (!records.length) continue;
      const outcome = applyPulled(getExisting(convId), convId, records, Date.now(), state.convs[convId]?.msgSigs);
      if (outcome.kind === "delete") {
        apply(convId, null);
        // Drop the ledger entry so the deletion sweep doesn't re-tombstone.
        const convsLeft = { ...state.convs };
        delete convsLeft[convId];
        state = { ...state, convs: convsLeft };
      } else {
        if (outcome.kind === "upsert") apply(convId, outcome.conv);
        state = absorbPulled(state, convId, seq, records);
      }
      saveState(state);
      debug("convSync pull applied %s (%d record(s))", outcome.kind, records.length);
    }
    if (cursor > state.global) {
      state = { ...state, global: cursor };
      saveState(state);
    }
  });
}
