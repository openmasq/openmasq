import { accountSecretFile, secretFile } from "./secretFile";

/**
 * The two sync-at-rest secrets (skeleton: `secretFile.ts`); this file states WHAT each one
 * protects (rule 10). ⚠️ Neither ever returns to the renderer's localStorage (plaintext on disk).
 */

/**
 * The sync PASSPHRASE: the E2E key that decrypts the account's synced vaults. PER ACCOUNT,
 * wired to the same effect as `keys`/`db`/`mcp` (at device scope, account B would sync with
 * A's key). FILED by account, never erased on switch: no escrow, so destroying an orphan
 * passphrase would lock out already-synced vaults.
 */
const pass = accountSecretFile("sync-pass", "passphrase");

/** Sign-in / account switch / sign-out — called by the SAME effect as
 *  `keys:set-user`, `db:set-user` and `mcp:set-user` (`../store/CLAUDE.md`). */
export const setSyncPassUser = (uid: string | null): void => pass.setUser(uid);

export const getSyncPass = (): string | null => pass.get();
export const setSyncPass = (value: string): void => pass.set(value);
export const clearSyncPass = (): void => pass.clear();

/**
 * The DEVICE SECRET (TOFU): proves to the server this device is the one it claims (the id
 * is enumerable, the secret is not). DEVICE scope on purpose: it answers "same machine",
 * not "who"; per account it would invent a new device on every sign-in.
 */
const deviceSecret = secretFile("sync-device-secret", "device secret");

export const getDeviceSecret = (): string | null => deviceSecret.get();
export const setDeviceSecret = (value: string): void => deviceSecret.set(value);
