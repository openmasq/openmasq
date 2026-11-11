import { safeStorage } from "electron";
import { notePlaintextWrite, plaintextRefused, plaintextWasWritten } from "./plainMarker";

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

/** Tests only: forget the memoized probe. */
export function resetEncryptionProbe(): void {
  available = undefined;
}

/** A store as read back: its map, and whether the bytes on disk were SEALED. */
export interface DecodedStore {
  map: Record<string, string>;
  sealed: boolean;
}

function parseObject(s: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(s) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, string>;
  } catch {
    /* not a store */
  }
  return null;
}

/**
 * May cleartext be taken for `file`? Only where THIS install wrote it in the clear
 * (`plainMarker.ts`). One adoption, for an install that predates the marker: with NO
 * keychain right now the store can only be in its documented fallback, so the cleartext is
 * its own — taken, and marked. With a keychain present and no marker, cleartext is not ours.
 */
function plaintextAllowed(file: string): boolean {
  if (plaintextWasWritten(file)) return true;
  if (!encryptionAvailable()) {
    notePlaintextWrite(file);
    return true;
  }
  plaintextRefused(file);
  return false;
}

/**
 * The SHARED read decoder for every secrets store (rule 9). Two invariants:
 * 1. NEVER mistake an ENCRYPTED blob we couldn't decrypt this session for an empty store:
 *    `null` = present but NOT readable, the caller leaves its cache untouched so a later
 *    read recovers once the keychain unlocks. Ciphertext read as UTF-8 never parses.
 * 2. NEVER take cleartext for a sealed store: with `file` given, the cleartext candidate
 *    (a value written during a keychain miss) counts only where `plaintextAllowed` says this
 *    install wrote it. `sealed: false` tells the caller to seal it again when it can.
 * Pinned by `plainMarker.test.ts`.
 */
export function decodeStore(buf: Buffer, file?: string): DecodedStore | null {
  if (encryptionAvailable()) {
    try {
      const map = parseObject(safeStorage.decryptString(buf));
      if (map) return { map, sealed: true };
    } catch {
      /* keychain locked/absent right now, or not sealed bytes — the cleartext candidate */
    }
  }
  const map = parseObject(buf.toString("utf8"));
  if (!map) return null;
  if (file !== undefined && !plaintextAllowed(file)) return null;
  return { map, sealed: false };
}

/** Text a person or the app wrote: it survives a UTF-8 round trip and holds no control
 *  character. Sealed bytes read as UTF-8 do neither. */
function isCleanText(buf: Buffer, s: string): boolean {
  return Buffer.from(s, "utf8").equals(buf) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s);
}

/**
 * The same rule for a store holding ONE value (`secretFile.ts`): the sealed value when the
 * keychain opens it; else cleartext only where this install wrote it — and only if it IS
 * text, so sealed bytes met without a keychain are never handed back as the secret.
 */
export function decodeSecret(buf: Buffer, file: string): string | null {
  if (encryptionAvailable()) {
    try {
      return safeStorage.decryptString(buf) || null;
    } catch {
      /* not sealed bytes, or the keychain is locked — the cleartext candidate */
    }
  }
  const s = buf.toString("utf8");
  if (!s || !isCleanText(buf, s)) return null;
  return plaintextAllowed(file) ? s : null;
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
