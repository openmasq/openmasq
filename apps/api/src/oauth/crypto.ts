import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * AES-256-GCM at rest for the local token file. The point of encryption here is
 * to protect the user's upstream provider tokens (Gmail/Slack) against casual
 * reads, cloud backups and file sync — NOT against an attacker who already has
 * full read access to the user's account (the key lives on the same machine, as
 * is unavoidable for an autonomous local broker). Provide `BROKER_ENCRYPTION_KEY`
 * (e.g. from the OS keychain) to separate key from data.
 */

const ALG = "aes-256-gcm";

/** Resolve a 32-byte key from env (base64/hex) or a generated 0600 key file. */
export function loadKey(dir: string, envKey: string): Buffer {
  if (envKey) {
    const buf = /^[0-9a-fA-F]{64}$/.test(envKey)
      ? Buffer.from(envKey, "hex")
      : Buffer.from(envKey, "base64");
    if (buf.length !== 32) throw new Error("BROKER_ENCRYPTION_KEY must be 32 bytes");
    return buf;
  }
  mkdirSync(dir, { recursive: true });
  const keyPath = join(dir, "key");
  if (existsSync(keyPath)) return Buffer.from(readFileSync(keyPath, "utf8"), "base64");
  const key = randomBytes(32);
  writeFileSync(keyPath, key.toString("base64"), { mode: 0o600 });
  chmodSync(keyPath, 0o600); // enforce even if umask widened it
  return key;
}

/** Encrypt a UTF-8 string → base64(iv ‖ tag ‖ ciphertext). */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

/** Inverse of {@link encrypt}; throws if the data was tampered with. */
export function decrypt(blob: string, key: Buffer): string {
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
