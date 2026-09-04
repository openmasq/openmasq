/**
 * End-to-end encryption for the vault. The whole product promise is "the secret
 * never leaves the machine in clear" — so before a vault is synced it is
 * encrypted here with a key **derived from a user passphrase** that only lives on
 * the user's devices. The server (and Supabase, and anyone with the DB) sees only
 * {@link EncryptedBlob} ciphertext.
 *
 * AES-GCM (authenticated) + PBKDF2-SHA256 key derivation. Uses the WebCrypto
 * `crypto.subtle` global present in browsers, Electron, the Capacitor WebView and
 * Node ≥ 20 — no Node-only APIs, so the same code runs on every surface.
 *
 * ⚠️ Cross-device restore requires the SAME passphrase on each device (that is
 * what makes it E2E — we never escrow the key). A device with a different/absent
 * passphrase simply can't decrypt a pulled blob; sync degrades to local-only.
 */
import type { ConvKeyEnvelope, EncryptedBlob, VaultPayload } from "./types";

const PBKDF2_ITERATIONS = 210_000; // OWASP 2023 floor for PBKDF2-SHA256
const SALT_BYTES = 16;
const IV_BYTES = 12;

/** Shared with `orgScope/orgCrypto.ts` (one home for the WebCrypto plumbing —
 *  rule 9): the subtle handle, base64 codecs and the CSPRNG. */
export const subtle = (): SubtleCrypto => {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) throw new Error("[sync] WebCrypto SubtleCrypto is unavailable in this runtime");
  return c.subtle;
};

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

export function randomBytes(n: number): Uint8Array {
  const u8 = new Uint8Array(n);
  (globalThis.crypto as Crypto).getRandomValues(u8);
  return u8;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await subtle().importKey(
    "raw",
    enc.encode(passphrase) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle().deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypt a vault payload into a server-safe opaque blob. */
/**
 * ⚠️ `threadId` is GCM ADDITIONAL DATA, not a convenience: without it nothing binds a
 * blob to the thread it was stored under, so a malicious (or compromised) server can
 * serve conversation A's vault in answer to a request for B. It decrypts cleanly under
 * the same passphrase and gets merged, and A's real values are then substituted back
 * into B's displayed replies and into B's forward pass. The RECORD channel already
 * binds this way (`recordAad`); the vault blob did not.
 *
 * Blobs written without it are `v:1` and stay readable — the binding is enforced on
 * everything written from now on rather than by a migration nobody can run offline.
 */
export async function encryptVault(
  payload: VaultPayload,
  passphrase: string,
  threadId?: string,
): Promise<EncryptedBlob> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(passphrase, salt);
  const aad = threadId ? { additionalData: enc.encode(threadId) as BufferSource } : {};
  const ciphertext = await subtle().encrypt(
    { name: "AES-GCM", iv: iv as BufferSource, ...aad },
    key,
    enc.encode(JSON.stringify(payload)) as BufferSource,
  );
  return { ciphertext: toB64(ciphertext), iv: toB64(iv), salt: toB64(salt), v: threadId ? 2 : 1 };
}

/** Decrypt a blob back to a vault payload. Throws if the passphrase is wrong or
 *  the ciphertext was tampered with (GCM auth tag fails) — callers treat a throw
 *  as "can't merge this remote", never as data loss. */
export async function decryptVault(
  blob: EncryptedBlob,
  passphrase: string,
  threadId?: string,
): Promise<VaultPayload> {
  const key = await deriveKey(passphrase, fromB64(blob.salt));
  // v:2 is bound to its thread id; a blob served under another id fails to authenticate
  // here rather than merging. v:1 predates the binding and is read unbound.
  const aad =
    blob.v === 2 && threadId ? { additionalData: enc.encode(threadId) as BufferSource } : {};
  const plain = await subtle().decrypt(
    { name: "AES-GCM", iv: fromB64(blob.iv) as BufferSource, ...aad },
    key,
    fromB64(blob.ciphertext) as BufferSource,
  );
  return JSON.parse(dec.decode(plain)) as VaultPayload;
}

// ---------------------------------------------------------------------------
// v2 — the RECORD channel's two-tier keys. The passphrase derives a KEK (cached:
// PBKDF2's 210k rounds are paid once per salt, not per record); each conversation
// gets a random DEK that encrypts its records and is stored server-side WRAPPED
// by the KEK (`ConvKeyEnvelope`). Changing the passphrase re-wraps the small
// envelopes — never re-encrypts the record history. Records are AES-GCM bound
// via AAD to their (convId, recordId), so the server cannot swap ciphertexts
// between records without failing the auth tag.
// ---------------------------------------------------------------------------

/** KEK cache: PBKDF2 is deliberately slow; one derivation per (passphrase, salt).
 *  Exported for `orgScope/orgCrypto.ts` (the member private key is wrapped under
 *  the SAME passphrase KEK as the conv envelopes — one derivation, one cache).
 *
 *  ⚠️ It is keyed by the PLAINTEXT PASSPHRASE and holds a live, usable `CryptoKey`,
 *  so it is exactly the material the passphrase is meant to gate. Nothing used to
 *  clear it: it outlived sign-out, « Désactiver la synchronisation » and an account
 *  switch, which means the previous account's KEK stayed resident and would still
 *  open its envelopes for the whole process lifetime. {@link clearKekCache} is called
 *  wherever the passphrase stops being the current one — `resetKeys()` on both record
 *  and org clients, and the desktop's `clearPassphrase()`. */
const kekCache = new Map<string, Promise<CryptoKey>>();

/** Forget every derived KEK. The next {@link kekFor} pays PBKDF2 again — that cost
 *  is the point: the cache must not survive the passphrase it was derived from. */
export function clearKekCache(): void {
  kekCache.clear();
}

export function kekFor(passphrase: string, saltB64: string): Promise<CryptoKey> {
  const k = `${saltB64}:${passphrase}`;
  let p = kekCache.get(k);
  if (!p) {
    p = deriveKey(passphrase, fromB64(saltB64));
    kekCache.set(k, p);
  }
  return p;
}

const importDek = (raw: Uint8Array): Promise<CryptoKey> =>
  subtle().importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);

/** Mint a conversation key: a random DEK + its KEK-wrapped envelope. */
export async function createConvKey(
  passphrase: string,
): Promise<{ envelope: ConvKeyEnvelope; dek: CryptoKey }> {
  const kekSalt = toB64(randomBytes(SALT_BYTES));
  const dekRaw = randomBytes(32);
  const dekIv = randomBytes(IV_BYTES);
  const kek = await kekFor(passphrase, kekSalt);
  const wrappedDek = await subtle().encrypt(
    { name: "AES-GCM", iv: dekIv as BufferSource },
    kek,
    dekRaw as BufferSource,
  );
  const dek = await importDek(dekRaw);
  dekRaw.fill(0);
  return { envelope: { kekSalt, dekIv: toB64(dekIv), wrappedDek: toB64(wrappedDek), v: 2 }, dek };
}

/** Unwrap a conversation's DEK. Throws on a wrong passphrase / tampered envelope
 *  (GCM auth) — callers treat a throw as "can't decrypt this conv", never loss. */
export async function openConvKey(
  envelope: ConvKeyEnvelope,
  passphrase: string,
): Promise<CryptoKey> {
  const kek = await kekFor(passphrase, envelope.kekSalt);
  const raw = await subtle().decrypt(
    { name: "AES-GCM", iv: fromB64(envelope.dekIv) as BufferSource },
    kek,
    fromB64(envelope.wrappedDek) as BufferSource,
  );
  return importDek(new Uint8Array(raw));
}

/** Passphrase change: re-wrap the DEK under the new passphrase (fresh salt+iv).
 *  The record history is untouched — only this small envelope is rewritten. */
export async function rewrapConvKey(
  envelope: ConvKeyEnvelope,
  oldPassphrase: string,
  newPassphrase: string,
): Promise<ConvKeyEnvelope> {
  const oldKek = await kekFor(oldPassphrase, envelope.kekSalt);
  const raw = new Uint8Array(
    await subtle().decrypt(
      { name: "AES-GCM", iv: fromB64(envelope.dekIv) as BufferSource },
      oldKek,
      fromB64(envelope.wrappedDek) as BufferSource,
    ),
  );
  const kekSalt = toB64(randomBytes(SALT_BYTES));
  const dekIv = randomBytes(IV_BYTES);
  const newKek = await kekFor(newPassphrase, kekSalt);
  const wrappedDek = await subtle().encrypt(
    { name: "AES-GCM", iv: dekIv as BufferSource },
    newKek,
    raw as BufferSource,
  );
  raw.fill(0);
  return { kekSalt, dekIv: toB64(dekIv), wrappedDek: toB64(wrappedDek), v: 2 };
}

/** AAD binding a record's ciphertext to its identity — the server can't swap
 *  blobs between records/conversations without failing the GCM tag. */
const recordAad = (convId: string, recordId: string): BufferSource =>
  enc.encode(`${convId} ${recordId}`) as BufferSource;

/** Encrypt one record payload under the conversation's DEK. */
export async function encryptRecord(
  dek: CryptoKey,
  convId: string,
  recordId: string,
  payload: unknown,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await subtle().encrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: recordAad(convId, recordId) },
    dek,
    enc.encode(JSON.stringify(payload)) as BufferSource,
  );
  return { ciphertext: toB64(ciphertext), iv: toB64(iv) };
}

/** Decrypt one record. Throws on tamper/mismatched identity (AAD) — the caller
 *  skips that record rather than merging unverified data. */
export async function decryptRecord(
  dek: CryptoKey,
  convId: string,
  recordId: string,
  blob: { ciphertext: string; iv: string },
): Promise<unknown> {
  const plain = await subtle().decrypt(
    {
      name: "AES-GCM",
      iv: fromB64(blob.iv) as BufferSource,
      additionalData: recordAad(convId, recordId),
    },
    dek,
    fromB64(blob.ciphertext) as BufferSource,
  );
  return JSON.parse(dec.decode(plain)) as unknown;
}

/** Generate a strong random passphrase (for a device that has none yet and wants
 *  to become the "first" device — the user then copies it to their others).
 *  32 alphanumeric chars (~190 bits); fixed length so it's easy to display/copy. */
export function generatePassphrase(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(32);
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}
