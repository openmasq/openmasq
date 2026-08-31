/**
 * The sync WITNESS — what "it works" means, recorded in the one place
 * that knows it: the transport's fetch.
 *
 * Sync is best-effort by contract (no passphrase ⇒ no-op, dead server ⇒ silence),
 * and that's the right contract to never break a send — but it makes a failure
 * INVISIBLE: "both apps seem to not be syncing" with no clue whatsoever,
 * while underneath every call was failing against an API answering 500. This module
 * adds no behavior at all: it OBSERVES, and Settings → Sync shows it.
 *
 * ⚠️ A 4xx is a FAILURE, not an exchange: 401 (token), 403 (revoked device — the
 * tombstone), 503 (device secret missing server-side) are precisely the
 * failures the witness exists to show. "The network works" isn't "sync
 * works". Session only, no persistence: the witness states what THIS session
 * has experienced — "no exchange since launch" is information, not a gap.
 *
 * ⚠️ **And the transport doesn't see everything.** A DECRYPTION failure (this
 * device's passphrase doesn't open the key envelope) lets every HTTP request succeed: the witness
 * would then announce "last exchange succeeded" on a completely dead sync — that's
 * exactly the hole it existed to close (measured on 14/08 on `@integrations`).
 * `recordCryptoFailure` is the other entry point, fed by the client's `onError`, and it's
 * FATAL: retrying can't fix it, so the displayed message must not
 * promise otherwise.
 */

export interface SyncExchangeState {
  lastOkAt: number | null;
  lastErrorAt: number | null;
  /** A SHORT, human reason ("HTTP 403", "unreachable") — never a response
   *  body, which could carry data. */
  lastError: string | null;
  /** The failure won't fix itself: a human must act (correct the passphrase).
   *  This changes the displayed MESSAGE, not just its color. */
  lastErrorFatal: boolean;
}

const state: SyncExchangeState = {
  lastOkAt: null,
  lastErrorAt: null,
  lastError: null,
  lastErrorFatal: false,
};

export function getExchangeState(): SyncExchangeState {
  return { ...state };
}

/** Tests only. */
export function resetExchangeState(): void {
  state.lastOkAt = null;
  state.lastErrorAt = null;
  state.lastError = null;
  state.lastErrorFatal = false;
}

/** The PURE classification of a call outcome — pinned by `status.test.ts`. */
export function classifyOutcome(
  outcome: { ok: true } | { ok: false; status: number } | { ok: false; network: true },
): { ok: boolean; reason: string | null } {
  if (outcome.ok) return { ok: true, reason: null };
  if ("network" in outcome) return { ok: false, reason: "serveur injoignable" };
  return { ok: false, reason: `HTTP ${outcome.status}` };
}

export function recordExchange(ok: boolean, reason: string | null, now = Date.now()): void {
  if (ok) {
    state.lastOkAt = now;
    // A successful exchange lifts the fatal flag: the passphrase may have been corrected in the meantime.
    state.lastErrorFatal = false;
  } else {
    state.lastErrorAt = now;
    state.lastError = reason;
    state.lastErrorFatal = false;
  }
}

/**
 * The failure the transport can NOT see: the bytes arrive, the key doesn't open
 * them. Marked fatal — this is what stops the screen from promising "will retry on its own"
 * for something no retry will fix.
 */
export function recordCryptoFailure(reason: string, now = Date.now()): void {
  state.lastErrorAt = now;
  state.lastError = reason;
  state.lastErrorFatal = true;
}

/**
 * Wraps the transport's fetch: every sync call feeds the witness, the response
 * goes back out INTACT — the caller keeps its contract, errors included.
 */
export function withExchangeWitness(
  fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    try {
      const res = await fetchImpl(input, init);
      const verdict = classifyOutcome(res.ok ? { ok: true } : { ok: false, status: res.status });
      recordExchange(verdict.ok, verdict.reason);
      return res;
    } catch (err) {
      const verdict = classifyOutcome({ ok: false, network: true });
      recordExchange(verdict.ok, verdict.reason);
      throw err;
    }
  };
}
