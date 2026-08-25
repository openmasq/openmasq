import { app, safeStorage } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { encryptionAvailable } from "./safeStore";

/**
 * At-rest encryption key for the per-account libSQL DB (the chats + the reversible
 * vault — the crown jewels). GATED so a developer's TablePlus / dev inspection
 * workflow is unaffected: encryption is ON only in a PACKAGED build AND when
 * Electron `safeStorage` is available to protect the key (a plaintext-stored key
 * would defeat the purpose). So `pnpm dev` keeps a plaintext DB you can open in
 * TablePlus; distributed builds encrypt real users' data at rest.
 *
 * Escape hatches (QA / support):
 *   - OPENMASQ_DB_ENCRYPT=1   → force encryption ON in dev (to test the migration)
 *   - OPENMASQ_DB_PLAINTEXT=1 → force it OFF (e.g. to inspect data in TablePlus)
 *
 * The key is a random 32-byte hex generated ONCE and stored encrypted in
 * `${userData}/db-key.enc` via safeStorage (mirrors keys.enc, 0600). ⚠️ If that
 * file is lost/corrupted the encrypted DB is unrecoverable — it is exactly as
 * durable as `keys.enc` (the provider API keys). It is NEVER regenerated while a
 * key file already exists (that would orphan an existing encrypted DB).
 */
const keyFile = () => join(app.getPath("userData"), "db-key.enc");

function shouldEncrypt(): boolean {
  // SECURITY (external scan #11): the plaintext escape hatch is DEV-ONLY. Honouring
  // OPENMASQ_DB_PLAINTEXT in a packaged build would let anyone who can set the app's
  // launch env force the DB + vault to open in cleartext, defeating at-rest encryption.
  if (!app.isPackaged && process.env.OPENMASQ_DB_PLAINTEXT === "1") return false;
  if (!encryptionAvailable()) return false; // can't protect the key → don't
  return app.isPackaged || process.env.OPENMASQ_DB_ENCRYPT === "1";
}

/**
 * SECURITY (audit H1): the DANGEROUS state — a PACKAGED (distributed) build whose OS
 * keychain is unavailable (Linux with no libsecret, a transient keyring failure). Here
 * {@link shouldEncrypt} is false, so the per-account DB + the reversible VAULT
 * (placeholder→REAL PII) + the attached-file blobs would all be written to disk in
 * CLEARTEXT — a full at-rest leak — with, until now, NO warning beyond a dev console line.
 * A developer build (`!app.isPackaged`) intentionally runs plaintext (TablePlus), so it is
 * NOT "insecure" in this sense. Callers use this to (a) surface a VISIBLE in-app warning
 * and (b) optionally HARD fail-closed (see {@link dbEncryptionKey}).
 */
export function dbAtRestInsecure(): boolean {
  return app.isPackaged && !encryptionAvailable();
}

let warnedInsecure = false;

/** Read the stored key. Returns null if the file is absent OR present-but-unreadable —
 *  the caller must NOT regenerate on the latter (see the class comment). */
function readKey(): string | null {
  if (!existsSync(keyFile())) return null;
  try {
    const buf = Buffer.from(readFileSync(keyFile(), "utf8"), "base64");
    return safeStorage.decryptString(buf) || null;
  } catch {
    return null;
  }
}

/** The DB encryption key, or null when the DB should stay PLAINTEXT (dev / no keyring /
 *  an unreadable key file — in which case we never destroy an existing encrypted DB). */
export function dbEncryptionKey(): string | null {
  if (!shouldEncrypt()) {
    // audit H1: a PACKAGED build that can't reach the keychain is about to persist the
    // vault (real PII) in cleartext. Make it LOUD (not a silent skip) and, when the
    // deployment opts into strict at-rest security, HARD fail-closed — refuse a key so
    // db.ts can decline to persist rather than write PII in clear. Default keeps the DB
    // usable (a no-keyring Linux user isn't locked out of their own chats); the visible
    // in-app warning + the strict switch are the mitigations. Residual (real fix): derive
    // the DB key from a user passphrase (mirror syncPass) when no keychain — tracked.
    if (dbAtRestInsecure()) {
      if (!warnedInsecure) {
        warnedInsecure = true;
        console.error(
          "[db] SECURITY: OS keychain unavailable in a packaged build — the DB + redaction " +
            "vault (real PII) will be stored UNENCRYPTED at rest. Set a machine keyring, or " +
            "run with OPENMASQ_REQUIRE_DB_ENCRYPTION=1 to refuse plaintext persistence.",
        );
      }
      if (process.env.OPENMASQ_REQUIRE_DB_ENCRYPTION === "1") {
        throw new Error(
          "DB at-rest encryption required (OPENMASQ_REQUIRE_DB_ENCRYPTION=1) but the OS " +
            "keychain is unavailable — refusing to persist the vault in cleartext.",
        );
      }
    }
    return null;
  }
  if (existsSync(keyFile())) {
    const k = readKey();
    if (k) return k;
    // Present but unreadable → do NOT regenerate (would orphan an encrypted DB).
    // Skip encryption this session; a transient safeStorage failure recovers next launch.
    console.error("[db] db-key.enc present but unreadable — opening WITHOUT encryption this session");
    return null;
  }
  try {
    const key = randomBytes(32).toString("hex");
    writeFileSync(keyFile(), safeStorage.encryptString(key).toString("base64"), { mode: 0o600 });
    return key;
  } catch (err) {
    console.error("[db] failed to create db-key.enc — DB stays plaintext:", err);
    return null;
  }
}

/**
 * At-rest encryption for attached-file BLOBS (F2). The user's ORIGINAL document
 * bytes — the densest PII surface — used to be written to `userData/files` in
 * CLEARTEXT even in an encrypted build (only the DB rows were encrypted). These
 * helpers encrypt each blob with the SAME per-account key that protects the DB, so
 * the blobs inherit the DB's at-rest posture AND its gating: dev / no-keyring →
 * `dbEncryptionKey()` is null → bytes stay plaintext (matching the DB, so TablePlus /
 * dev inspection is unaffected).
 *
 * Format: MAGIC("KVF1") | iv(12) | authTag(16) | ciphertext  (AES-256-GCM). The magic
 * prefix makes `decryptBytes` a no-op passthrough for any bytes we did NOT write —
 * pre-existing plaintext blobs from before this change, or an unrelated external file
 * — so reads stay backward-compatible and can't corrupt a non-encrypted input.
 */
const BLOB_MAGIC = Buffer.from("KVF1");

/** Encrypt blob bytes when a DB key is available; otherwise return them unchanged
 *  (same plaintext gating as the DB — dev / no keyring). */
export function encryptBytes(data: Uint8Array): Uint8Array {
  const keyHex = dbEncryptionKey();
  if (!keyHex) return data;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([BLOB_MAGIC, iv, cipher.getAuthTag(), ct]);
}

/** True when `data` was produced by {@link encryptBytes} (has our magic header). Used by
 *  the one-time sweep that re-encrypts pre-existing PLAINTEXT blobs so it skips ones that
 *  are already encrypted (double-encrypting would make them unreadable). */
export function looksEncrypted(data: Uint8Array): boolean {
  return (
    data.length >= BLOB_MAGIC.length + 28 &&
    Buffer.from(data.buffer, data.byteOffset, BLOB_MAGIC.length).equals(BLOB_MAGIC)
  );
}

/** Decrypt bytes we encrypted; pass through anything without our magic header (legacy
 *  plaintext blob / external file), and fail-safe to the raw bytes on any auth error. */
export function decryptBytes(data: Uint8Array): Uint8Array {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (buf.length < BLOB_MAGIC.length + 28 || !buf.subarray(0, BLOB_MAGIC.length).equals(BLOB_MAGIC)) {
    return data; // not ours → untouched
  }
  const keyHex = dbEncryptionKey();
  if (!keyHex) return data; // can't decrypt without the key — leave as-is
  try {
    const iv = buf.subarray(4, 16);
    const tag = buf.subarray(16, 32);
    const ct = buf.subarray(32);
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
    decipher.setAuthTag(tag);
    return new Uint8Array(Buffer.concat([decipher.update(ct), decipher.final()]));
  } catch {
    return data; // auth failure / coincidental magic → don't corrupt the read
  }
}
