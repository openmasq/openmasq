import { safeStorage } from "electron";
import { encryptionAvailable } from "../store/safeStore";
import { assertPlaintextAllowed } from "../store/atRestPolicy";
import { notePlaintextWrite, plaintextRefused, plaintextWasWritten } from "../store/plainMarker";

/**
 * How ONE connector credential (OAuth state, token, env secrets, API key) is sealed inside
 * the per-account store: `safeStorage`, base64. Cleartext only where the at-rest policy
 * allows it — and READ BACK only where this install wrote it (`../store/plainMarker.ts`, the
 * same marker every secrets store uses): base64 JSON dropped into the file is otherwise
 * taken for a token of the user's, which a planted file could supply.
 */

/** Encrypt a JSON-serialisable value to base64 (OS keychain via safeStorage). `file`: the
 *  store it goes into, marked BEFORE a cleartext value is written. */
export function encryptCred(value: unknown, file: string | null): string {
  const json = JSON.stringify(value);
  if (encryptionAvailable()) {
    return safeStorage.encryptString(json).toString("base64");
  }
  assertPlaintextAllowed("MCP connector credentials");
  console.warn("[mcp] safeStorage unavailable — storing credentials unencrypted");
  if (file) notePlaintextWrite(file);
  return Buffer.from(json, "utf8").toString("base64");
}

/** May a cleartext entry of `file` be taken? Where this install wrote one; or, for a store
 *  older than the marker, when there is NO keychain right now (it can only be the fallback:
 *  adopted and marked). With a keychain and no marker, cleartext is not ours. A signed-out
 *  store (`file` null) lives in memory only: what it holds, this process wrote. */
function cleartextAllowed(file: string | null): boolean {
  if (!file || plaintextWasWritten(file)) return true;
  if (!encryptionAvailable()) {
    notePlaintextWrite(file);
    return true;
  }
  plaintextRefused(file);
  return false;
}

export function decryptCred<T>(enc: string | undefined, label: string, file: string | null, onCorrupt?: () => void): T | undefined {
  if (!enc) return undefined;
  const keychain = encryptionAvailable();
  const buf = Buffer.from(enc, "base64");
  if (keychain) {
    try {
      return JSON.parse(safeStorage.decryptString(buf)) as T;
    } catch (err) {
      // (a) A cleartext-fallback entry (written without a keychain) is base64 JSON: recover
      //     it where it is ours, never drop it.
      let clear: T | undefined;
      try {
        clear = JSON.parse(buf.toString("utf8")) as T;
      } catch {
        // (b) DROP only here: the keychain IS available and the bytes are neither its
        //     ciphertext nor JSON (a real key↔ciphertext mismatch).
        console.warn(`[mcp] unreadable ${label}: ${err instanceof Error ? err.message : String(err)}`);
        onCorrupt?.();
        return undefined;
      }
      // cleartext nobody here wrote: left in place (an older build still reads its own), not used
      return cleartextAllowed(file) ? clear : undefined;
    }
  }
  // No keychain now: a miss is transient, so an entry that does not parse is KEPT and
  // skipped this session (non-destructive, like dbCrypto).
  try {
    const clear = JSON.parse(buf.toString("utf8")) as T;
    return cleartextAllowed(file) ? clear : undefined;
  } catch (err) {
    console.warn(`[mcp] unreadable ${label}: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}
