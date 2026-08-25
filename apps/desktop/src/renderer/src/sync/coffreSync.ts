/**
 * Desktop orchestration of the COFFRE sync — the always-redacted terms,
 * E2E-encrypted on the record channel's reserved `@coffre` scope (same envelope
 * as conversations; the server only sees ciphertext). Unlike `@userdata`, this
 * scope is BIDIRECTIONAL with the extension too — the backend gate opens exactly
 * this one conv id to the contributor so the terms are enforceable on every
 * surface. All decisions live in `@openmasq/sync` `coffre.ts` (pure, tested,
 * shared with mobile + extension); this file only persists the per-account
 * ledger (term ids + signatures) and serialises push/pull.
 */
import Debug from "debug";
import { BRAND } from "@openmasq/branding";
import {
  absorbCoffreRecords,
  emitCoffreRecords,
  emptyCoffreSyncState,
  type CoffreSyncState,
  type SyncedCoffreTerm,
} from "@openmasq/sync";
import { authHost } from "../auth";
import { recordSync, syncDeviceId } from "./client";

const debug = Debug("openmasq:sync");

const stateKey = (accountId: string) => `${BRAND.slug}:coffre-sync:${accountId}`;

function loadState(accountId: string): CoffreSyncState {
  try {
    const raw = localStorage.getItem(stateKey(accountId));
    if (raw) {
      const s = JSON.parse(raw) as CoffreSyncState;
      if (s.accountId === accountId) return s;
    }
  } catch {
    /* fresh ledger → an idempotent re-emit at worst */
  }
  return emptyCoffreSyncState(accountId);
}

function saveState(state: CoffreSyncState): void {
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

/** Push the Coffre delta (new/changed terms + tombstones for local deletions).
 *  The ledger advances ONLY on a successful push. */
export function pushCoffre(local: SyncedCoffreTerm[]): Promise<void> {
  return serial(async () => {
    const rs = recordSync();
    if (!rs) return;
    const account = (await authHost.getSession().catch(() => null))?.id;
    if (!account) return;
    const state = loadState(account);
    const { records, state: next } = emitCoffreRecords(local, state, syncDeviceId());
    if (!records.length) return;
    const pushed = await rs.pushCoffre(records);
    if (pushed > 0) {
      debug("coffre: pushed %d record(s)", pushed);
      saveState(next);
    }
  });
}

/** Pull the full scope and fold it into the local terms. Returns the merged
 *  list when something changed (the caller applies it to settings), else null. */
export function pullCoffre(local: SyncedCoffreTerm[]): Promise<SyncedCoffreTerm[] | null> {
  return serial(async () => {
    const rs = recordSync();
    if (!rs) return null;
    const account = (await authHost.getSession().catch(() => null))?.id;
    if (!account) return null;
    const state = loadState(account);
    const { records } = await rs.pullCoffre(0);
    if (!records.length) return null;
    const { terms, state: next, changed } = absorbCoffreRecords(local, records, state);
    saveState(next);
    debug("coffre: pulled %d record(s), changed=%s", records.length, changed);
    return changed ? terms : null;
  });
}
