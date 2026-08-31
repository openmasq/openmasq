import { app, safeStorage } from "electron";
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { encryptionAvailable } from "./safeStore";
import { safeUid } from "./keys";
import { BRAND } from "@openmasq/branding";

/**
 * ONE sync-at-rest secret, encrypted — the skeleton the passphrase and the device
 * secret share.
 *
 * Extracted the day the second one arrived: both hold a single value, in a
 * file `${userData}/<name>.enc` (0600, base64), encrypted by `safeStorage` (OS
 * keychain / DPAPI) with a PLAINTEXT base64 fallback and a warning when encryption is
 * not available. Two copies would have diverged at the first tweak — and these are
 * precisely the files where a divergence doesn't show.
 *
 * ⚠️ They live in the MAIN process, never in the renderer: Chromium's localStorage
 * is plaintext LevelDB on disk.
 */
export interface SecretFile {
  get(): string | null;
  set(value: string): void;
  clear(): void;
}

export function secretFile(name: string, label: string): SecretFile {
  const path = () => join(app.getPath("userData"), `${name}.enc`);
  return {
    get() {
      try {
        if (!existsSync(path())) return null;
        const buf = Buffer.from(readFileSync(path(), "utf8"), "base64");
        const s = encryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString("utf8");
        return s || null;
      } catch {
        return null;
      }
    },
    set(value: string) {
      const v = value.trim();
      if (!v) return this.clear();
      try {
        const enc = encryptionAvailable()
          ? safeStorage.encryptString(v).toString("base64")
          : (console.warn(`[sync] safeStorage unavailable — storing ${label} unencrypted`),
            Buffer.from(v, "utf8").toString("base64"));
        writeFileSync(path(), enc, { mode: 0o600 });
      } catch (err) {
        console.error(`[sync] failed to write ${name}.enc:`, err);
      }
    },
    clear() {
      try {
        if (existsSync(path())) rmSync(path());
      } catch (err) {
        console.error(`[sync] failed to clear ${name}.enc:`, err);
      }
    },
  };
}

export interface AccountSecretFile extends SecretFile {
  /** Re-scope onto `uid` (sign-in / account CHANGE); `null` = signed out. */
  setUser(uid: string | null): void;
  /** Is an account resolved? False ⇒ nothing is read or written to disk. */
  scoped(): boolean;
}

/**
 * The SAME secret, but **per account** — `${userData}/accounts/<name>-<uid>.enc`.
 *
 * The skeleton is `keys.ts`'s (per-account isolation, one-time adoption of the old
 * shared file, uid sanitized before touching a path) because it's the same problem:
 * a shared machine must never let account B use account A's secret. Recopying
 * this skeleton a third time would have been the same bug with more surface (rule 9) — hence
 * this variant here, next to the one that isn't.
 *
 * ⚠️ **Signed out, we write NOTHING** (like `keys.ts`): no "unknown account" file
 * that a following account would inherit. But unlike `keys.ts`, `set()` **throws** in this
 * case instead of silently doing nothing — setting a sync passphrase is a gesture whose
 * result the UI announces, and a "done" that did nothing is exactly the
 * defect being fixed here. `clear()` stays tolerant: clearing what doesn't exist is a success.
 */
export function accountSecretFile(name: string, label: string): AccountSecretFile {
  let uid: string | null = null;
  const accountsDir = () => join(app.getPath("userData"), "accounts");
  const legacyFile = () => join(app.getPath("userData"), `${name}.enc`);
  const marker = () => join(app.getPath("userData"), `.${BRAND.slug}-legacy-${name}-adopted`);
  const path = (): string | null => (uid ? join(accountsDir(), `${name}-${safeUid(uid)}.enc`) : null);

  /**
   * ONE-TIME adoption of the old shared file: it goes to the FIRST account that
   * signs in after the update — its owner in the vast majority of cases, and
   * the one who would otherwise lose their passphrase with no way to recover it (no escrow). A
   * marker closes the door for everyone else, and the old file is DELETED so
   * the shared secret doesn't linger. Same gesture as `keys.ts` / `db/` / `mcp/persist.ts`.
   */
  const adoptLegacy = (): void => {
    const scoped = path();
    if (!scoped) return;
    try {
      if (existsSync(scoped)) return; // this account already has its own
      if (existsSync(marker())) return; // already claimed by an account
      if (!existsSync(legacyFile())) {
        writeFileSync(marker(), "", { mode: 0o600 }); // nothing to adopt — close the door
        return;
      }
      mkdirSync(accountsDir(), { recursive: true });
      copyFileSync(legacyFile(), scoped); // encrypted bytes: the same keychain reopens them
      writeFileSync(marker(), uid ?? "", { mode: 0o600 });
      try {
        unlinkSync(legacyFile());
      } catch {
        /* best-effort — the marker already prevents a second adoption */
      }
    } catch (e) {
      console.error(`[sync] legacy ${name} adoption failed:`, e);
    }
  };

  return {
    setUser(next) {
      uid = next == null ? null : safeUid(next) || null;
      if (uid) adoptLegacy();
    },
    scoped: () => !!uid,
    get() {
      const p = path();
      if (!p) return null;
      try {
        if (!existsSync(p)) return null;
        const buf = Buffer.from(readFileSync(p, "utf8"), "base64");
        const s = encryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString("utf8");
        return s || null;
      } catch {
        return null;
      }
    },
    set(value: string) {
      const v = value.trim();
      if (!v) return this.clear();
      const p = path();
      if (!p) throw new Error(`no account — refusing to store the ${label}`);
      try {
        mkdirSync(accountsDir(), { recursive: true });
        const enc = encryptionAvailable()
          ? safeStorage.encryptString(v).toString("base64")
          : (console.warn(`[sync] safeStorage unavailable — storing ${label} unencrypted`),
            Buffer.from(v, "utf8").toString("base64"));
        writeFileSync(p, enc, { mode: 0o600 });
      } catch (err) {
        console.error(`[sync] failed to write ${name}-<uid>.enc:`, err);
        throw err; // the caller MUST be able to say it wasn't set
      }
    },
    clear() {
      const p = path();
      if (!p) return;
      try {
        if (existsSync(p)) rmSync(p);
      } catch (err) {
        console.error(`[sync] failed to clear ${name}-<uid>.enc:`, err);
        throw err; // same here: a "disabled" that disabled nothing is a lie
      }
    },
  };
}
