import { app, safeStorage } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeEncryptedBlob, encryptionAvailable } from "./safeStore";
import { assertPlaintextAllowed } from "./atRestPolicy";

/**
 * Encrypted at-rest store for the SUPABASE AUTH SESSION (access + refresh tokens),
 * in `${userData}/auth.enc` — so the refresh token (persistent account access) is
 * NOT left sitting in plaintext localStorage. Encrypted with Electron `safeStorage`
 * (base64, 0600); falls back to base64 plaintext with a warning when encryption is
 * unavailable (Linux without a keyring). Mirrors `keys.ts`.
 *
 * A generic string key→value map: Supabase's storage adapter passes its OWN keys
 * (`sb-<ref>-auth-token`, the PKCE code-verifier, …), each persisted here.
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
    // No session stored yet → empty is correct AND cacheable. Any other read error is
    // treated as transient (don't poison the cache).
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return (cache = {});
    return {};
  }
  const map = decodeEncryptedBlob(buf);
  // PRESENT but undecryptable this session (encrypted + keychain briefly unavailable): do
  // NOT cache {} — that drops the Supabase session and forces a needless re-login while the
  // file is intact on disk. Return empty transiently so it recovers once the keychain unlocks
  // (audit B2 read side, mirrors keys.ts).
  if (!map) return {};
  return (cache = map);
}

function write(map: Store): void {
  cache = map;
  try {
    const json = JSON.stringify(map);
    const enc = encryptionAvailable()
      ? safeStorage.encryptString(json).toString("base64")
      : (assertPlaintextAllowed("Supabase session (access + refresh token)"),
        console.warn("[auth] safeStorage unavailable — storing session unencrypted"),
        Buffer.from(json, "utf8").toString("base64"));
    writeFileSync(file(), enc, { mode: 0o600 });
  } catch (err) {
    console.error("[auth] failed to write auth.enc:", err);
  }
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
