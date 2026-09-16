import { app, safeStorage } from "electron";
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { decodeEncryptedBlob, encryptionAvailable } from "./safeStore";
import { BRAND } from "@openmasq/branding";
import { assertPlaintextAllowed } from "./atRestPolicy";

/**
 * Encrypted at-rest store for provider API keys, keyed by id (a `ProviderId` or
 * `"redactModel"`). Keys live ONLY in main: the renderer never reads one back, the key is
 * injected at call time. PER-ACCOUNT (`accounts/keys-<uid>.enc` via `setKeysUser`, called
 * alongside `db:set-user` / `mcp:set-user`): B never uses A's keys. Signed out / unresolved
 * ⇒ an in-memory EMPTY store, never persisted.
 */
type KeyMap = Record<string, string>;

// `undefined` = not resolved yet (startup, before the first set-user); `null` = signed out;
// string = the signed-in account. Only a string uid persists to / reads from disk.
let currentUid: string | null | undefined ;
let cache: KeyMap | null = null;

const legacyFile = () => join(app.getPath("userData"), "keys.enc"); // pre-isolation shared store
const accountsDir = () => join(app.getPath("userData"), "accounts");
const legacyMarker = () => join(app.getPath("userData"), `.${BRAND.slug}-legacy-keys-adopted`);

/** The `uid` arrives from the RENDERER and is interpolated into a path: keep only
 *  `[A-Za-z0-9_-]` (same charset as the DB store). "" ⇒ signed-out (fail closed). */
export function safeUid(uid: string): string {
  return uid.replace(/[^a-zA-Z0-9_-]/g, "");
}
// `currentUid` is already sanitized; sanitized again as defence-in-depth.
const scopedFile = (uid: string) => join(accountsDir(), `keys-${safeUid(uid)}.enc`);

/** The active account's key file, or null when signed out / unresolved (no persistence). */
function file(): string | null {
  return currentUid ? scopedFile(currentUid) : null;
}

function read(): KeyMap {
  if (cache) return cache;
  const path = file();
  if (!path) return (cache = {}); // signed out / unresolved → empty, never touches disk
  let buf: Buffer;
  try {
    buf = Buffer.from(readFileSync(path, "utf8"), "base64");
  } catch (e) {
    // No file yet → empty AND cacheable. Any OTHER error is transient (don't poison the cache).
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return (cache = {});
    return {};
  }
  const map = decodeEncryptedBlob(buf);
  // PRESENT but undecryptable this session (keychain briefly unavailable): do NOT cache {},
  // so a later read recovers the keys once the keychain unlocks.
  if (!map) return {};
  return (cache = map);
}

function write(map: KeyMap): void {
  const path = file();
  if (!path) {
    cache = map; // signed out / unresolved → in-memory only, never persisted
    return;
  }
  // The strict at-rest refusal runs BEFORE the try, so a refused write never reaches the
  // cache and reports success (`atRestPolicy.ts`).
  const canEncrypt = encryptionAvailable();
  if (!canEncrypt) assertPlaintextAllowed("provider API keys");
  try {
    mkdirSync(accountsDir(), { recursive: true });
    const json = JSON.stringify(map);
    const enc = canEncrypt
      ? safeStorage.encryptString(json).toString("base64")
      : (console.warn("[keys] safeStorage unavailable — storing API keys unencrypted"),
        Buffer.from(json, "utf8").toString("base64"));
    writeFileSync(path, enc, { mode: 0o600 });
  } catch (err) {
    console.error("[keys] failed to write keys.enc:", err);
    return; // the cache must not claim a key the next launch will not find
  }
  cache = map; // only what actually reached the disk
}

/**
 * One-time LEGACY adoption (same shape as the DB/MCP stores): the shared `keys.enc` goes to
 * the FIRST account that signs in, a marker blocks every OTHER account, and the shared file
 * is DELETED so the secret never lingers.
 */
function maybeAdoptLegacy(uid: string): void {
  try {
    if (existsSync(scopedFile(uid))) return; // this account already has its own store
    if (existsSync(legacyMarker())) return; // legacy already claimed by an account
    if (!existsSync(legacyFile())) {
      writeFileSync(legacyMarker(), "", { mode: 0o600 }); // nothing to adopt — close the door
      return;
    }
    mkdirSync(accountsDir(), { recursive: true });
    copyFileSync(legacyFile(), scopedFile(uid));
    writeFileSync(legacyMarker(), uid, { mode: 0o600 });
    try {
      unlinkSync(legacyFile()); // remove the shared secret so no other account can read it
    } catch {
      /* best-effort — the marker already prevents re-adoption */
    }
  } catch (e) {
    console.error("[keys] legacy adoption failed:", e);
  }
}

/** Re-scope the key store to `uid` (sign-in / account switch); `null` = signed out.
 *  Resets the cache so the previous account's keys are NEVER served after a switch. */
export function setKeysUser(uid: string | null): void {
  // An all-illegal uid ⇒ SIGNED OUT (in-memory, never persisted), not a derived path.
  const safe = uid == null ? null : safeUid(uid) || null;
  currentUid = safe;
  cache = null;
  if (safe) maybeAdoptLegacy(safe);
}

export function getKey(id: string): string | undefined {
  return read()[id] || undefined;
}

export function setKey(id: string, value: string): void {
  const v = value.trim();
  if (!v) return clearKey(id);
  write({ ...read(), [id]: v });
}

export function clearKey(id: string): void {
  const map = { ...read() };
  delete map[id];
  write(map);
}

/** Ids that currently have a key (for the write-only Settings UI + validation). */
export function configuredKeys(): string[] {
  const map = read();
  return Object.keys(map).filter((k) => !!map[k]);
}

/** One-time migration: set only ids not already present; ignore empty values. */
export function importKeys(map: KeyMap): void {
  const cur = read();
  const next = { ...cur };
  let changed = false;
  for (const [id, value] of Object.entries(map)) {
    const v = (value ?? "").trim();
    if (v && !next[id]) {
      next[id] = v;
      changed = true;
    }
  }
  if (changed) write(next);
}

/** Backstop applied just before the provider fetch: a pasted stored key never leaves. */
export function scrubKeys(text: string): string {
  let out = text;
  for (const value of Object.values(read())) {
    if (value && value.length >= 8) out = out.split(value).join("[REDACTED_API_KEY]");
  }
  return out;
}
