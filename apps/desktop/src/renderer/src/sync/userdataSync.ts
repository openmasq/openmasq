/**
 * Desktop orchestration of the USERDATA studio sync — compétences, workflows,
 * mémoire, E2E-encrypted on the record channel's reserved `@userdata` scope
 * (same envelope as conversations; the server only sees ciphertext). All
 * decisions live in `@openmasq/sync` `userdata.ts` (pure, tested, shared with
 * mobile); this file only persists the per-account ledger (entity ids +
 * signatures, nothing sensitive beyond what the encrypted records carry) and
 * serialises push/pull (both read-modify-write the ledger).
 */
import Debug from "debug";
import { BRAND } from "@openmasq/branding";
import {
  absorbUserdataRecords,
  emitUserdataRecords,
  emptyUserdataSyncState,
  type UserdataSnapshot,
  type UserdataSyncState,
} from "@openmasq/sync";
import { authHost } from "../auth";
import { recordSync, syncDeviceId } from "./client";

const debug = Debug("openmasq:sync");

const stateKey = (accountId: string) => `${BRAND.slug}:userdata-sync:${accountId}`;

function loadState(accountId: string): UserdataSyncState {
  try {
    const raw = localStorage.getItem(stateKey(accountId));
    if (raw) {
      const s = JSON.parse(raw) as UserdataSyncState;
      if (s.accountId === accountId) return s;
    }
  } catch {
    /* fresh ledger → an idempotent re-emit at worst */
  }
  return emptyUserdataSyncState(accountId);
}

function saveState(state: UserdataSyncState): void {
  try {
    localStorage.setItem(stateKey(state.accountId), JSON.stringify(state));
  } catch {
    /* best-effort */
  }
}

let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

/** Push the studio delta (new/changed entities + tombstones for local
 *  deletions). The ledger advances ONLY on a successful push. */
export function pushUserdataStudio(local: UserdataSnapshot): Promise<void> {
  return serial(async () => {
    const rs = recordSync();
    if (!rs) return;
    const account = (await authHost.getSession().catch(() => null))?.id;
    if (!account) return;
    const state = loadState(account);
    const { records, state: next } = emitUserdataRecords(local, state, syncDeviceId());
    if (!records.length) return;
    const pushed = await rs.pushUserdata(records);
    if (pushed > 0) {
      debug("userdata studio: pushed %d record(s)", pushed);
      saveState(next);
    }
  });
}

/** Pull the full scope and fold it into the local snapshot. Returns the merged
 *  snapshot when something changed (the caller applies it to settings), else
 *  null. Absorbed records are ledgered so this device never echoes them back. */
export function pullUserdataStudio(local: UserdataSnapshot): Promise<UserdataSnapshot | null> {
  return serial(async () => {
    const rs = recordSync();
    if (!rs) return null;
    const account = (await authHost.getSession().catch(() => null))?.id;
    if (!account) return null;
    const state = loadState(account);
    const { records } = await rs.pullUserdata(0);
    if (!records.length) return null;
    const { snapshot, state: next, changed } = absorbUserdataRecords(local, records, state);
    saveState(next);
    debug("userdata studio: pulled %d record(s), changed=%s", records.length, changed);
    return changed ? snapshot : null;
  });
}
