import { safeStorage } from "electron";

/**
 * Single choke-point for the OS keychain, shared by every encrypted-at-rest store.
 * 1. Probe the keychain ONCE: `isEncryptionAvailable()` touches it (and prompts on an
 *    unsigned build), so the answer is memoized per process.
 * 2. Defer the first unlock to LOGIN: the only store read before sign-in is `authStore`,
 *    held behind {@link whenWindowShown} so the prompt appears over a visible window.
 */

let available: boolean | undefined;

/** Memoized `safeStorage.isEncryptionAvailable()`. Every store gates on this. */
export function encryptionAvailable(): boolean {
  // Cache only a TRUE result. A FALSE is a possibly transient miss that must not lock the
  // session into plaintext writes: re-probe so it can recover.
  if (available === true) return true;
  available = safeStorage.isEncryptionAvailable();
  return available;
}

/**
 * The SHARED read decoder for every secrets store (rule 9). The invariant: NEVER mistake
 * an ENCRYPTED blob we couldn't decrypt this session for an empty store. Keychain decrypt
 * first, then a plaintext read (a value written during a prior transient miss); the FIRST
 * candidate that parses to a JSON object wins, and ciphertext read as UTF-8 never does.
 * `null` = present but NOT readable this session: the caller leaves its cache untouched so
 * a later read recovers once the keychain unlocks.
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
