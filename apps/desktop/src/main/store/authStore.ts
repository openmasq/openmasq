import { app, safeStorage } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeStore, encryptionAvailable } from "./safeStore";
import { notePlaintextWrite, noteSealedWrite } from "./plainMarker";
import { assertPlaintextAllowed } from "./atRestPolicy";

/**
 * Encrypted at-rest store for the AUTH SESSION (access + refresh tokens): a refresh token
 * is persistent account access and must not sit in plaintext localStorage. Mirrors
 * `keys.ts`. A generic key→value map: the auth client's storage adapter brings its OWN keys.
 */
type Store = Record<string, string>;

const file = () => join(app.getPath("userData"), "auth.enc");
let cache: Store | null = null;

function read(): Store {
  if (cache) return cache;
  let buf: Buffer;
  try {
    buf = Buffer.from(readFileSync(file(), "utf8"), "base64");
  } catch (e) {
    // No session yet → empty AND cacheable. Any other error is transient.
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return (cache = {});
    return {};
  }
  const decoded = decodeStore(buf, file());
  // PRESENT but undecryptable this session, or cleartext this install never wrote: do NOT
  // cache {} (a needless re-login while the file is intact); recover once the keychain unlocks.
  if (!decoded) return {};
  cache = decoded.map;
  // Written in the clear during a keychain miss, and the keychain is back: seal it now.
  if (!decoded.sealed && encryptionAvailable()) write(decoded.map);
  return cache;
}

function write(map: Store): void {
  // Strict at-rest refuses BEFORE the try, so a refused write never reports success
  // (`atRestPolicy.ts`).
  const canEncrypt = encryptionAvailable();
  if (!canEncrypt) assertPlaintextAllowed("Supabase session (access + refresh token)");
  try {
    const json = JSON.stringify(map);
    const enc = canEncrypt
      ? safeStorage.encryptString(json).toString("base64")
      : (console.warn("[auth] safeStorage unavailable — storing session unencrypted"),
        Buffer.from(json, "utf8").toString("base64"));
    if (!canEncrypt) notePlaintextWrite(file()); // before the bytes (`plainMarker.ts`)
    writeFileSync(file(), enc, { mode: 0o600 });
    if (canEncrypt) noteSealedWrite(file());
  } catch (err) {
    console.error("[auth] failed to write auth.enc:", err);
    return; // the cache must not report a session that never reached the disk
  }
  cache = map; // only what actually reached the disk
}

export function authStoreGet(key: string): string | null {
  return read()[key] ?? null;
}

export function authStoreSet(key: string, value: string): void {
  write({ ...read(), [key]: value });
}

export function authStoreRemove(key: string): void {
  const map = { ...read() };
  delete map[key];
  write(map);
}

/** Every stored value whose KEY satisfies `pred` — the session reader in `sessionAccount.ts`
 *  finds the auth client's session by its key suffix without knowing the project ref. */
export function authStoreValues(pred: (key: string) => boolean): string[] {
  return Object.entries(read())
    .filter(([k]) => pred(k))
    .map(([, v]) => v);
}
