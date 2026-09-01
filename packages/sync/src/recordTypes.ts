/**
 * RECORD-CHANNEL (v2) shapes — split out of `types.ts` (rule 1). The vault /
 * org / device shapes stay there; everything the record oplog needs is here.
 */
// ---------------------------------------------------------------------------
// RECORD SYNC (v2) — conversations + the integrations directory, as an E2E
// encrypted, append-only oplog per conversation. Unlike the vault channel (one
// LWW blob per thread), a conversation is append-mostly: each message is ONE
// immutable record, so bidirectional desktop⇄mobile merge is a union by id and
// only the meta (title/settings) needs last-write-wins. The server assigns a
// monotone `seq` per conversation (pull = "records since my cursor") and a
// global cursor (`GET /sync/records?since=` = "which convs changed"), and never
// sees anything but ciphertext.
// ---------------------------------------------------------------------------

/** Record kinds. `message` is immutable (union by entity); `convMeta`,
 *  `integration` and `userdata` are LWW per entity; tombstones delete their
 *  entity (and, for `convTombstone`, the whole conversation). */
export type SyncRecordKind =
  | "message"
  | "convMeta"
  | "convTombstone"
  | "integration"
  | "integrationTombstone"
  | "userdata"
  | "userdataTombstone"
  | "coffre"
  | "coffreTombstone";

/** One plaintext sync record (client-side only — encrypted before transport).
 *  `payload` is deliberately opaque to this package: the canonical chat shapes
 *  live in `@openmasq/schema`; each app serialises its own. `entityId` is what
 *  merge/tombstones key on (message id, "meta", or the integration's id). */
export interface SyncRecord {
  /** Client uuid — idempotent re-push (server dedupes on it). */
  recordId: string;
  entityId: string;
  kind: SyncRecordKind;
  /** Per-device Lamport clock (never a wall clock) — drives LWW + ordering. */
  lamport: number;
  deviceId: string;
  payload: unknown;
}

/** The encrypted wire form of one record. The ciphertext is AES-GCM bound (via
 *  AAD) to (convId, recordId), so the server cannot swap blobs between records. */
export interface EncryptedRecord {
  recordId: string;
  ciphertext: string;
  iv: string;
}

/** A record as returned by the server: ciphertext + its per-conv sequence. */
export interface ServerRecord extends EncryptedRecord {
  seq: number;
}

/** The per-conversation key envelope (server-stored, opaque): a random DEK
 *  wrapped by the passphrase-derived KEK. Changing the passphrase re-wraps
 *  these small envelopes — never re-encrypts the record history. */
export interface ConvKeyEnvelope {
  kekSalt: string;
  dekIv: string;
  wrappedDek: string;
  v: 2;
}

/** The integrations DIRECTORY syncs as records under this reserved scope: which
 *  connectors are connected, on which account, with which settings — config, not
 *  credentials. OAuth tokens are NEVER synced (per-device grants; rotation races
 *  + blast radius); only an opt-in static key may ride an `integrationSecret`
 *  payload, landing in the destination device's keychain. */
export const INTEGRATIONS_SCOPE = "@integrations";

/** The user's AUTHORED studio data — skills, workflows, memory — syncs as
 *  records under this reserved scope (see `userdata.ts`). It is REAL user
 *  content (prompts, durable personal facts), so it rides the SAME E2E envelope
 *  as conversations: encrypted under the scope's DEK, server sees ciphertext
 *  only. Not `ext:`-prefixed on purpose — the backend's direction gate therefore
 *  keeps the extension (`contributor`) from reading OR writing it; only
 *  desktop/mobile (`replica`) sync it. */
export const USERDATA_SCOPE = "@userdata";

/** The user's COFFRE — the dictionary of values ALWAYS redacted — syncs as
 *  records under this reserved scope (see `coffre.ts`). Same E2E envelope as
 *  every other scope (server sees ciphertext only). ⚠️ Unlike `@userdata`, this
 *  scope is DELIBERATELY opened to the `contributor` extension in BOTH
 *  directions (the backend's direction gate special-cases exactly this conv id):
 *  the Coffre's whole contract is "always redacted on EVERY surface", so the
 *  extension must read the terms to enforce them before a ChatGPT send. Residual
 *  accepted: a compromised extension (which already holds the passphrase and the
 *  per-thread vaults) can also read this one scope's terms — it still cannot
 *  read conversations, userdata, or any other record. */
export const VAULT_TERMS_SCOPE = "@coffre";

/** Conversations pushed by the browser extension live under this conv-id prefix.
 *  The backend enforces DIRECTION on it: a `contributor` device (the extension —
 *  the most compromisable surface, and it holds the passphrase, so E2E does not
 *  protect against it) may only PUT into this namespace and may never GET records
 *  at all. Desktop/mobile (`replica`) read it as read-only ChatGPT threads. */
export const EXTENSION_SCOPE_PREFIX = "ext:";

/** The record-channel transport (v2 endpoints). Separate from `SyncTransport` so
 *  existing implementations/fakes keep compiling; `httpTransport` returns both. */
export interface RecordTransport {
  /** Conversations with records newer than the global cursor (+ the new cursor). */
  listChangedConvs(since: number): Promise<{ convIds: string[]; cursor: number }>;
  /** A conversation's records with seq > since, oldest first. */
  getRecords(convId: string, since: number): Promise<{ records: ServerRecord[]; seq: number }>;
  /** Append encrypted records (idempotent on recordId). Returns the latest seq. */
  putRecords(convId: string, records: EncryptedRecord[]): Promise<number>;
  /** The conversation's key envelope, or null if none yet. */
  getConvKey(convId: string): Promise<ConvKeyEnvelope | null>;
  /** Store the envelope if absent; returns the CANONICAL envelope (first writer
   *  wins — a concurrent second device must adopt the returned one). With
   *  `replace` (passphrase re-wrap, replica-only server-side) the envelope is
   *  overwritten; the server retains the previous one as a recovery net. */
  putConvKey(convId: string, envelope: ConvKeyEnvelope, replace?: boolean): Promise<ConvKeyEnvelope>;
  /** Every conv id that has a key envelope (drives passphrase re-wrap). */
  listConvKeys(): Promise<string[]>;
  /** Purge a conversation server-side (records + key). Deletion must be real. */
  deleteConv(convId: string): Promise<void>;
}
