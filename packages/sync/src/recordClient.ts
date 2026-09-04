/**
 * The record channel's client (v2) — conversations + the integrations directory.
 * Same philosophy as `vaultClient`: BEST-EFFORT everywhere (no passphrase / no
 * transport / signed out / network down → no-op or empty, never a throw that
 * blocks the user), and the server only ever sees ciphertext.
 *
 * Key provisioning is FIRST-WRITER-WINS: pushing to a conversation with no key
 * envelope mints one (random DEK wrapped by the passphrase KEK) and PUTs it; the
 * server returns the CANONICAL envelope, so a concurrent second device silently
 * adopts the first one's and re-encrypts with it. A device whose passphrase
 * cannot open a conversation's envelope skips that conversation (local-only
 * degrade — same contract as the vault channel).
 */
import {
  createConvKey,
  decryptRecord,
  encryptRecord,
  openConvKey,
  rewrapConvKey,
  clearKekCache,
} from "./crypto";
import type {
  ConvKeyEnvelope,
  EncryptedRecord,
  RecordTransport,
  SyncRecord,
} from "./types";
import { VAULT_TERMS_SCOPE, INTEGRATIONS_SCOPE, USERDATA_SCOPE } from "./types";

export interface RecordSyncOptions {
  transport: RecordTransport;
  /** The E2E passphrase, or null → sync is OFF (every call no-ops). */
  getPassphrase: () => Promise<string | null> | string | null;
  onError?: (scope: string, error: unknown) => void;
}

export interface PulledRecords {
  records: SyncRecord[];
  /** The caller's next per-conversation cursor. */
  seq: number;
}

export interface RecordSync {
  /** Encrypt + append records to a conversation. Returns how many were pushed. */
  push(convId: string, records: SyncRecord[]): Promise<number>;
  /** Decrypt a conversation's records since the caller's cursor. Records that
   *  fail to decrypt (tamper / other passphrase) are SKIPPED, never merged. */
  pull(convId: string, since: number): Promise<PulledRecords>;
  /** Conversations changed since the caller's global cursor. */
  changed(since: number): Promise<{ convIds: string[]; cursor: number }>;
  /** Purge a conversation server-side (records + key envelope). */
  remove(convId: string): Promise<void>;
  /** Integrations DIRECTORY sugar — the reserved scope. */
  pushIntegrations(records: SyncRecord[]): Promise<number>;
  pullIntegrations(since: number): Promise<PulledRecords>;
  /** Userdata studio sugar (skills / workflows / memory) — its scope. */
  pushUserdata(records: SyncRecord[]): Promise<number>;
  pullUserdata(since: number): Promise<PulledRecords>;
  /** Coffre sugar (always-redacted terms) — its scope, extension-accessible. */
  pushVaultTerms(records: SyncRecord[]): Promise<number>;
  pullVaultTerms(since: number): Promise<PulledRecords>;
  /** Forget the "sealed" scopes (see `dekFor`) — to call when this device's passphrase
   *  CHANGES, since that's the only event that can make an envelope
   *  openable again. Without it the circuit-breaker would hold until restart, and a
   *  corrected passphrase would have no visible effect. */
  resetKeys(): void;
  /** Passphrase change: re-wrap EVERY conversation's key envelope. Returns the
   *  conv ids that were re-wrapped (a conv the old passphrase can't open is
   *  skipped and reported via onError — never destroyed). */
  rewrapAllKeys(oldPassphrase: string, newPassphrase: string): Promise<string[]>;
}

/**
 * A CRYPTO failure — WebCrypto throws `OperationError` when the key doesn't open the content,
 * i.e. when this device's passphrase doesn't match the stored envelope.
 * As opposed to a dropped network or a 500, which do deserve a retry.
 *
 * EXPORTED because it has two readers for two different reasons: here to stop
 * retrying, and on the application side to stop announcing "all is well" (the
 * sync indicator only observes HTTP, which succeeds). Two copies would have drifted at the first
 * browser that names the error differently.
 */
export function isCryptoFailure(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "OperationError";
}

export function createRecordSync(opts: RecordSyncOptions): RecordSync {
  const { transport } = opts;
  const report = (scope: string, e: unknown) => opts.onError?.(scope, e);

  /** The scopes we KNOW this device's passphrase doesn't open the envelope for.
   *
   *  A decryption failure isn't randomness: neither the stored envelope nor the passphrase
   *  change on their own, so the next attempt will fail identically. Without this
   *  circuit-breaker every cycle retried and re-reported without moving anything forward — 24
   *  reports in a few hours for two devices, measured on 14/08 on `@integrations`.
   *  So we stop at the first time, say it ONCE, and reopen when the passphrase
   *  changes (`resetKeys`). SESSION-scoped, nothing is persisted: a restart retries. */
  const sealed = new Set<string>();

  /** Get-or-mint the conversation's DEK. Null → sync off / can't decrypt / scope sealed. */
  async function dekFor(convId: string, provision: boolean): Promise<CryptoKey | null> {
    const pass = await opts.getPassphrase();
    if (!pass) return null;
    if (sealed.has(convId)) return null;
    try {
      let envelope = await transport.getConvKey(convId);
      if (!envelope) {
        if (!provision) return null;
        const minted = await createConvKey(pass);
        envelope = await transport.putConvKey(convId, minted.envelope);
        // First writer wins: if the server kept OURS, reuse the minted DEK
        // directly; otherwise adopt the canonical envelope below.
        if (envelope.wrappedDek === minted.envelope.wrappedDek) return minted.dek;
      }
      return await openConvKey(envelope, pass);
    } catch (e) {
      // Sealed BEFORE reporting: that's what makes a report go out only once
      // per scope per session.
      if (isCryptoFailure(e)) sealed.add(convId);
      report(`dekFor(${convId})`, e);
      return null;
    }
  }

  async function push(convId: string, records: SyncRecord[]): Promise<number> {
    if (!records.length) return 0;
    const dek = await dekFor(convId, true);
    if (!dek) return 0;
    try {
      const wire: EncryptedRecord[] = [];
      for (const r of records) {
        const blob = await encryptRecord(dek, convId, r.recordId, r);
        wire.push({ recordId: r.recordId, ...blob });
      }
      await transport.putRecords(convId, wire);
      return wire.length;
    } catch (e) {
      report(`push(${convId})`, e);
      return 0;
    }
  }

  async function pull(convId: string, since: number): Promise<PulledRecords> {
    const empty = { records: [], seq: since };
    const dek = await dekFor(convId, false);
    if (!dek) return empty;
    try {
      const { records, seq } = await transport.getRecords(convId, since);
      const out: SyncRecord[] = [];
      for (const r of records) {
        try {
          out.push((await decryptRecord(dek, convId, r.recordId, r)) as SyncRecord);
        } catch (e) {
          report(`decrypt(${convId}/${r.recordId})`, e); // skip, never merge unverified
        }
      }
      return { records: out, seq };
    } catch (e) {
      report(`pull(${convId})`, e);
      return empty;
    }
  }

  return {
    push,
    pull,

    resetKeys() {
      sealed.clear();
      // The passphrase behind the cached KEKs is no longer the current one (it changed,
      // or the account did) — a cache keyed by the plaintext passphrase must not outlive
      // it. See `crypto.ts` `clearKekCache`.
      clearKekCache();
    },

    async changed(since) {
      try {
        return await transport.listChangedConvs(since);
      } catch (e) {
        report("changed", e);
        return { convIds: [], cursor: since };
      }
    },

    async remove(convId) {
      try {
        await transport.deleteConv(convId);
      } catch (e) {
        report(`remove(${convId})`, e);
      }
    },

    pushIntegrations: (records) => push(INTEGRATIONS_SCOPE, records),
    pullIntegrations: (since) => pull(INTEGRATIONS_SCOPE, since),
    pushUserdata: (records) => push(USERDATA_SCOPE, records),
    pullUserdata: (since) => pull(USERDATA_SCOPE, since),
    pushVaultTerms: (records) => push(VAULT_TERMS_SCOPE, records),
    pullVaultTerms: (since) => pull(VAULT_TERMS_SCOPE, since),

    async rewrapAllKeys(oldPassphrase, newPassphrase) {
      const done: string[] = [];
      let convIds: string[] = [];
      try {
        convIds = await transport.listConvKeys();
      } catch (e) {
        report("rewrapAllKeys/list", e);
        return done;
      }
      for (const convId of convIds) {
        try {
          const envelope = await transport.getConvKey(convId);
          if (!envelope) continue;
          const next: ConvKeyEnvelope = await rewrapConvKey(envelope, oldPassphrase, newPassphrase);
          await transport.putConvKey(convId, next, true);
          done.push(convId);
        } catch (e) {
          report(`rewrapAllKeys(${convId})`, e); // skipped, old envelope intact
        }
      }
      return done;
    },
  };
}
