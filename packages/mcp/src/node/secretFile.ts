/**
 * AES-256-GCM at rest for a local secrets file, under a key file the owner alone can read.
 *
 * What this protects against, stated plainly: casual reads, a cloud backup, a file-sync
 * client, a `grep` through a home directory. **Not** an attacker who already has the user's
 * account — the key lives on the same machine, which is unavoidable for a tool that must
 * reconnect without a human. Pass `envKey` (from an OS keychain or a secret manager) to
 * separate key from data; no key file is then written at all.
 *
 * **The cipher is portable; the file permissions are not.** `node:crypto` gives the same
 * AES-256-GCM on macOS, Linux and Windows. The 0600 mode does not: Node maps `chmod` on
 * Windows to the read-only attribute alone and never touches an NTFS ACL, so "owner only" is
 * enforced by the mode on POSIX and by the profile directory's inherited ACL on Windows —
 * weaker, and said out loud rather than implied. The desktop app has a stronger answer there
 * (Electron `safeStorage`, i.e. DPAPI/Keychain/libsecret), which a pure-Node CLI cannot use.
 *
 * One home for the posture: the broker's token file and the proxy's MCP connector tokens are
 * the same problem, and were the same forty lines twice.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ALG = "aes-256-gcm";

/** Owner-only, where the platform can say so. On Windows `chmod` only toggles read-only, and
 *  clearing that bit is not what we want, so it is left alone: the ACL is the guard there. */
function restrict(path: string): void {
  if (process.platform === "win32") return;
  try {
    chmodSync(path, 0o600);
  } catch {
    // A file on a mount with no permission model (exFAT, some network shares). The mode was
    // already requested at creation; failing the whole run over it would help nobody.
  }
}

/** The directory too: on a permissive umask a 0755 folder lets anyone list what is in it —
 *  the file names alone say which services this machine is signed in to. */
function privateDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
  if (process.platform === "win32") return;
  try {
    chmodSync(dir, 0o700);
  } catch {
    /* same reason as `restrict` */
  }
}

/** A 32-byte key from `envKey` (hex or base64), or a generated 0600 key file in `dir`. */
export function loadKey(dir: string, envKey = ""): Buffer {
  if (envKey) {
    const buf = /^[0-9a-fA-F]{64}$/.test(envKey)
      ? Buffer.from(envKey, "hex")
      : Buffer.from(envKey, "base64");
    if (buf.length !== 32) throw new Error("the encryption key must be 32 bytes");
    return buf;
  }
  privateDir(dir);
  const keyPath = join(dir, "key");
  if (existsSync(keyPath)) return Buffer.from(readFileSync(keyPath, "utf8"), "base64");
  const key = randomBytes(32);
  writeFileSync(keyPath, key.toString("base64"), { mode: 0o600 });
  restrict(keyPath);
  return key;
}

/** Encrypt a UTF-8 string → base64(iv ‖ tag ‖ ciphertext). */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

/** Decrypt what {@link encrypt} produced. Throws on a wrong key or a tampered blob — the
 *  GCM tag is the point: a silently truncated token file must not read as an empty one. */
export function decrypt(blob: string, key: Buffer): string {
  const raw = Buffer.from(blob, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

/** A JSON document encrypted at rest in one file. Reads are tolerant of an absent file and
 *  REFUSE a corrupt one: an unreadable store is an error to show, never an empty store to
 *  silently start over from (that would look like "you were never logged in"). */
export class SecretJsonFile<T extends object> {
  private readonly key: Buffer;

  constructor(
    private readonly path: string,
    dir: string,
    envKey = "",
  ) {
    this.key = loadKey(dir, envKey);
  }

  read(): T | undefined {
    if (!existsSync(this.path)) return undefined;
    return JSON.parse(decrypt(readFileSync(this.path, "utf8"), this.key)) as T;
  }

  write(doc: T): void {
    privateDir(join(this.path, ".."));
    writeFileSync(this.path, encrypt(JSON.stringify(doc), this.key), { mode: 0o600 });
    restrict(this.path);
  }
}
