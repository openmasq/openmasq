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
  absorbVaultTermRecords,
  emitVaultTermRecords,
  emptyVaultTermsSyncState,
  type VaultTermsSyncState,
  type SyncedVaultTerm,
} from "@openmasq/sync";
import { authHost } from "../auth";
import { recordSync, syncDeviceId } from "./client";

const debug = Debug("openmasq:sync");

const stateKey = (accountId: string) => `${BRAND.slug}:coffre-sync:${accountId}`;

function loadState(accountId: string): VaultTermsSyncState {
  try {
    const raw = localStorage.getItem(stateKey(accountId));
    if (raw) {
      const s = JSON.parse(raw) as VaultTermsSyncState;
      if (s.accountId === accountId) return s;
    }
  } catch {
    /* fresh ledger → an idempotent re-emit at worst */
  }
  return emptyVaultTermsSyncState(accountId);
}

function saveState(state: VaultTermsSyncState): void {
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
export function pushVaultTerms(local: SyncedVaultTerm[]): Promise<void> {
  return serial(async () => {
    const rs = recordSync();
    if (!rs) return;
    const account = (await authHost.getSession().catch(() => null))?.id;
    if (!account) return;
    const state = loadState(account);
    const { records, state: next } = emitVaultTermRecords(local, state, syncDeviceId());
    if (!records.length) return;
    const pushed = await rs.pushVaultTerms(records);
    if (pushed > 0) {
      debug("coffre: pushed %d record(s)", pushed);
      saveState(next);
    }
  });
}

/** Pull the full scope and fold it into the local terms. Returns the merged
 *  list when something changed (the caller applies it to settings), else null. */
export function pullVaultTerms(local: SyncedVaultTerm[]): Promise<SyncedVaultTerm[] | null> {
  return serial(async () => {
    const rs = recordSync();
    if (!rs) return null;
    const account = (await authHost.getSession().catch(() => null))?.id;
    if (!account) return null;
    const state = loadState(account);
    const { records } = await rs.pullVaultTerms(0);
    if (!records.length) return null;
    const { terms, state: next, changed } = absorbVaultTermRecords(local, records, state);
    saveState(next);
    debug("coffre: pulled %d record(s), changed=%s", records.length, changed);
    return changed ? terms : null;
  });
}
