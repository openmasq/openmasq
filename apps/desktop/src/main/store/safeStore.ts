import { safeStorage } from "electron";

/**
 * Single choke-point for the OS keychain (macOS Keychain / Windows DPAPI /
 * libsecret), shared by every encrypted-at-rest store: `keys.ts`, `authStore.ts`,
 * `dbCrypto.ts`, `syncPass.ts`, `mcp/persist.ts`.
 *
 * Two jobs:
 *
 * 1. **Probe the keychain ONCE.** `safeStorage.isEncryptionAvailable()` touches
 *    the keychain on macOS. Each store used to call it on every read AND write, so
 *    a single startup stacked several redundant accesses (each of which prompts on
 *    an ad-hoc-signed / unsigned dev build, where the grant isn't persisted).
 *    `encryptionAvailable()` memoizes the answer, so we probe a single time per
 *    process; the first real `decryptString` then reuses Electron's cached derived
 *    key. (On a properly Developer-ID-signed + notarised build the OS remembers the
 *    "Always Allow" grant and none of this prompts after the first ever launch.)
 *
 * 2. **Defer the first unlock to LOGIN, not cold boot.** The only store touched
 *    before sign-in is `authStore` (Supabase restoring the persisted session). We
 *    hold that read behind {@link whenWindowShown} so the keychain prompt appears
 *    over an on-screen window at login — not during cold boot before first paint,
 *    which reads as "the app can't even start without the keychain". Every other
 *    store is read only after the account resolves (`db:set-user`/`mcp:set-user`
 *    and on-demand IPC), so it naturally follows and reuses the same unlock.
 */

let available: boolean | undefined;

/** Memoized `safeStorage.isEncryptionAvailable()` — probes the keychain at most
 *  once per process. Every store gates on this instead of calling safeStorage. */
export function encryptionAvailable(): boolean {
  // Cache only a TRUE result (the expensive/prompting case — once the keychain is
  // usable it stays usable, and Electron caches the derived key). A FALSE is NOT
  // memoized: a transient miss (keychain briefly locked/contended at the first probe)
  // must not lock the whole session into plaintext writes + trigger destructive
  // credential drops on reads (audit M-8) — re-probe so it can recover mid-session.
  if (available === true) return true;
  available = safeStorage.isEncryptionAvailable();
  return available;
}

/**
 * Decode a base64-wrapped encrypted-at-rest blob back to its JSON map — the SHARED read
 * decoder for every secrets store (`keys.ts`, `authStore.ts`; rule 9, one definition).
 *
 * The invariant it exists to hold (audit M-8 read side): NEVER mistake an ENCRYPTED blob
 * we merely couldn't decrypt this session for an empty store. The old per-store code, when
 * the keychain was briefly unavailable at read time, read the ciphertext as UTF-8 →
 * `JSON.parse` threw → the store returned `{}` → every provider key / the Supabase session
 * silently VANISHED (the "keys gone after restart" report), and the file — still intact on
 * disk — stayed hidden for the whole session.
 *
 * Order: try the keychain decrypt FIRST (only when available), then a plaintext read (the
 * legit case of a value base64-written during a PRIOR transient miss). Accept the FIRST
 * candidate that parses to a JSON object — ciphertext read as UTF-8 never will, which is
 * exactly what stops the silent drop.
 *
 * Returns `null` when the bytes are present but NOT readable this session (encrypted +
 * keychain down, or a decrypt that threw with no valid plaintext fallback). The caller MUST
 * then leave its cache untouched and return an empty map only TRANSIENTLY, so the keys /
 * session recover on a later read once the keychain unlocks — no restart, no re-entry.
 */
export function decodeEncryptedBlob(buf: Buffer): Record<string, string> | null {
  const candidates: string[] = [];
  if (encryptionAvailable()) {
    try {
      candidates.push(safeStorage.decryptString(buf));
    } catch {
      /* keychain locked/absent right now — fall through to the plaintext candidate */
    }
  }
  candidates.push(buf.toString("utf8"));
  for (const s of candidates) {
    try {
      const parsed = JSON.parse(s) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    } catch {
      /* not this candidate — try the next */
    }
  }
  return null;
}

// --- Window-shown gate -------------------------------------------------------

let resolveShown!: () => void;
const shown = new Promise<void>((resolve) => {
  resolveShown = resolve;
});

/** Called once from `createWindow`'s `ready-to-show`, when the window is painted. */
export function markWindowShown(): void {
  resolveShown();
}

/** Resolves when the main window is on screen (immediately once it already is).
 *  The auth-session IPC awaits this so its keychain access lands at login. */
export function whenWindowShown(): Promise<void> {
  return shown;
}
