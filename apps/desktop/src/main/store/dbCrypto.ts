import { app, safeStorage } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { encryptionAvailable } from "./safeStore";

/**
 * At-rest encryption key for the per-account DB (chats + the reversible vault). ON only in
 * a PACKAGED build AND when `safeStorage` can protect the key; `pnpm dev` stays plaintext
 * for inspection. `OPENMASQ_DB_ENCRYPT=1` forces it ON in dev, `OPENMASQ_DB_PLAINTEXT=1`
 * forces it OFF (dev only).
 *
 * A random 32-byte key generated ONCE, stored encrypted in `${userData}/db-key.enc`
 * (0600). ⚠️ Lost ⇒ the encrypted DB is unrecoverable; NEVER regenerated while a key file
 * exists (that would orphan the DB).
 */
const keyFile = () => join(app.getPath("userData"), "db-key.enc");

function shouldEncrypt(): boolean {
  // The plaintext escape hatch is DEV-ONLY: in a packaged build anyone setting the launch
  // env could force the vault open in cleartext.
  if (!app.isPackaged && process.env.OPENMASQ_DB_PLAINTEXT === "1") return false;
  if (!encryptionAvailable()) return false; // can't protect the key → don't
  return app.isPackaged || process.env.OPENMASQ_DB_ENCRYPT === "1";
}

/**
 * The DANGEROUS state: a PACKAGED build whose OS keychain is unavailable, so the DB, the
 * VAULT and the blobs would be written in CLEARTEXT. A dev build is plaintext on purpose,
 * not "insecure". Callers surface a VISIBLE warning and may HARD fail-closed
 * ({@link dbEncryptionKey}).
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
    // A PACKAGED build without a keychain is about to persist real PII in cleartext: LOUD,
    // and HARD fail-closed under the strict switch. The default keeps the DB usable (a
    // no-keyring user isn't locked out). RESIDUAL: derive the key from a passphrase.
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
    // Present but unreadable → do NOT regenerate (would orphan the DB); skip this session.
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
 * At-rest encryption for attached-file BLOBS (the densest PII surface), with the SAME
 * per-account key and gating as the DB. Format: MAGIC | iv(12) | authTag(16) | ciphertext
 * (AES-256-GCM). The magic prefix makes `decryptBytes` a passthrough for bytes we did NOT
 * write, so a plaintext blob or an external file is never corrupted.
 */
const BLOB_MAGIC = Buffer.from("KVF1");

/** Encrypt when a DB key is available; otherwise unchanged (same gating as the DB). */
export function encryptBytes(data: Uint8Array): Uint8Array {
  const keyHex = dbEncryptionKey();
  if (!keyHex) return data;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([BLOB_MAGIC, iv, cipher.getAuthTag(), ct]);
}

/** Has our magic header. The re-encryption sweep skips these (double-encrypting would
 *  make them unreadable). */
export function looksEncrypted(data: Uint8Array): boolean {
  return (
    data.length >= BLOB_MAGIC.length + 28 &&
    Buffer.from(data.buffer, data.byteOffset, BLOB_MAGIC.length).equals(BLOB_MAGIC)
  );
}

/** Decrypt our bytes; pass through anything without our header; raw bytes on an auth error. */
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
