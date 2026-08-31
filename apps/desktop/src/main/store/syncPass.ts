import { accountSecretFile, secretFile } from "./secretFile";

/**
 * The two sync-at-rest secrets, encrypted by `safeStorage` (OS keychain)
 * in `${userData}`. The skeleton is shared (`secretFile.ts`); this file only states
 * WHAT each one protects — that's the only thing that distinguishes them, and it deserves
 * to be readable at a glance (rule 10: the secrets-at-rest stores, together).
 *
 * ⚠️ Neither one should ever return to the renderer's localStorage: that's
 * Chromium LevelDB, in plaintext on disk.
 */

/**
 * The sync PASSPHRASE — the E2E key that decrypts the synced vaults of every
 * device on the account. Not set ⇒ vault sync is off.
 *
 * ⚠️ **PER ACCOUNT**, and it was the fourth store that `CLAUDE.md` flagged as "the
 * leak" if it wasn't wired to the same effect as `keys`/`db`/`mcp`. At DEVICE
 * scope, switching accounts left the passphrase in place: account B ended up
 * synced with A's key — without having asked for it, and without holding it. The E2E promise
 * ("nobody but you has the key") was therefore false for it, and its vaults
 * went out encrypted by a key someone else knows. The backend does scope every row to the
 * verified token, so A can't READ B's — but the guarantee itself was lost.
 *
 * We FILE by account, we never erase on switch: there's no escrow, so
 * destroying an orphaned passphrase would permanently lock out already-synced vaults. Coming
 * back to A must find its own again.
 */
const pass = accountSecretFile("sync-pass", "passphrase");

/** Sign-in / account switch / sign-out — called by the SAME effect as
 *  `keys:set-user`, `db:set-user` and `mcp:set-user` (`../store/CLAUDE.md`). */
export const setSyncPassUser = (uid: string | null): void => pass.setUser(uid);

export const getSyncPass = (): string | null => pass.get();
export const setSyncPass = (value: string): void => pass.set(value);
export const clearSyncPass = (): void => pass.clear();

/**
 * The DEVICE SECRET (TOFU) — what proves to the server that this device really is
 * that one, and so what closes off replica impersonation: the device id is enumerable
 * from the device list, the secret is not. It used to live in plaintext in localStorage,
 * i.e. exactly where the passphrase had stopped living — the asymmetry was
 * backwards from its role.
 *
 * ⚠️ This one stays at DEVICE scope, and that's intentional: it doesn't answer "who are you"
 * but "is this really the same machine". Splitting it by account would invent a new device
 * on every sign-in — the device list would fill up with duplicates and TOFU would lose
 * what it's worth. It's the passphrase that belongs to the account, not the machine.
 */
const deviceSecret = secretFile("sync-device-secret", "device secret");

export const getDeviceSecret = (): string | null => deviceSecret.get();
export const setDeviceSecret = (value: string): void => deviceSecret.set(value);
