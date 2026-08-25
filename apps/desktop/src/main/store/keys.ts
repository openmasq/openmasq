import { app, safeStorage } from "electron";
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { decodeEncryptedBlob, encryptionAvailable } from "./safeStore";
import { BRAND } from "@openmasq/branding";

/**
 * Encrypted at-rest store for provider API keys. Keyed by id (a `ProviderId`, or the
 * special `"redactModel"`). Values are encrypted with Electron `safeStorage` (OS keychain
 * / DPAPI) and base64-stored; falls back to base64 plaintext with a warning when encryption
 * is unavailable (e.g. a Linux box with no keyring). Mirrors `mcp/persist.ts`.
 *
 * Keys live ONLY in the main process: the renderer never reads them back, and the provider
 * key is injected here at call time (see `index.ts`), never carried in the renderer or
 * written to localStorage in clear.
 *
 * **PER-ACCOUNT (privacy isolation, mirrors the DB + MCP stores).** A shared machine must
 * NEVER let account B use account A's provider keys. `setKeysUser(uid)` scopes the store to
 * `${userData}/accounts/keys-<uid>.enc`; signed out / unresolved ⇒ an in-memory EMPTY store
 * that is never persisted. The renderer's store calls `keys:set-user` on sign-in / account
 * switch / sign-out ALONGSIDE `db:set-user` / `mcp:set-user`, so a key entered by one account
 * is unreachable by another (and injected into a provider call only for its owner).
 */
type KeyMap = Record<string, string>;

// `undefined` = not resolved yet (startup, before the first set-user); `null` = signed out;
// string = the signed-in account. Only a string uid persists to / reads from disk.
let currentUid: string | null | undefined ;
let cache: KeyMap | null = null;

const legacyFile = () => join(app.getPath("userData"), "keys.enc"); // pre-isolation shared store
const accountsDir = () => join(app.getPath("userData"), "accounts");
const legacyMarker = () => join(app.getPath("userData"), `.${BRAND.slug}-legacy-keys-adopted`);

/**
 * SECURITY (audit M10 — path traversal): the `uid` arrives from the RENDERER over the
 * `keys:set-user` IPC and is interpolated into a filesystem path (`keys-<uid>.enc`), so a
 * crafted value (`../../evil`) could escape `accounts/` and write an encrypted blob to an
 * arbitrary location / point the active scope at unintended files. Sanitize to the SAME
 * charset the sibling per-account DB store uses (`db.ts` `setDbUser`): keep only
 * `[A-Za-z0-9_-]`, so no separator / `.` can survive. Returns "" for an all-illegal uid,
 * which callers treat as signed-out (fail closed — never persist to a derived path).
 */
export function safeUid(uid: string): string {
  return uid.replace(/[^a-zA-Z0-9_-]/g, "");
}
// `currentUid` only ever holds a sanitized uid (see `setKeysUser`), so `scopedFile` is
// always fed a safe segment; sanitize again as defence-in-depth against any future caller.
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
    // No file yet (first run for this account) → an empty store is correct AND cacheable.
    // Any OTHER read error is treated as transient (don't poison the cache).
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return (cache = {});
    return {};
  }
  const map = decodeEncryptedBlob(buf);
  // File PRESENT but undecryptable this session (encrypted + keychain briefly unavailable):
  // do NOT cache {} — that blanks every key for the whole session and hides the intact file.
  // Return empty transiently so a later read recovers the keys once the keychain unlocks
  // (no restart, no re-entry) — the fix for the "keys gone after restart" report.
  if (!map) return {};
  return (cache = map);
}

function write(map: KeyMap): void {
  cache = map;
  const path = file();
  if (!path) return; // signed out / unresolved → in-memory only, never persisted
  try {
    mkdirSync(accountsDir(), { recursive: true });
    const json = JSON.stringify(map);
    const enc = encryptionAvailable()
      ? safeStorage.encryptString(json).toString("base64")
      : (console.warn("[keys] safeStorage unavailable — storing API keys unencrypted"),
        Buffer.from(json, "utf8").toString("base64"));
    writeFileSync(path, enc, { mode: 0o600 });
  } catch (err) {
    console.error("[keys] failed to write keys.enc:", err);
  }
}

/**
 * One-time LEGACY adoption (mirrors the DB/MCP legacy adoption): the pre-isolation shared
 * `keys.enc` is moved into the FIRST account that signs in after the upgrade — its owner, who
 * would otherwise land on an empty key store — then a marker blocks every OTHER account from
 * inheriting it. The legacy file is DELETED after the copy so the shared secret never lingers
 * on disk. (Encrypted bytes copy verbatim — same machine keychain decrypts them.)
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
  // Sanitize BEFORE it ever reaches a path (audit M10). A non-null uid that sanitizes to
  // empty (an all-illegal value from a compromised renderer) is treated as SIGNED OUT — an
  // in-memory empty store that never persists — rather than writing to a derived path.
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

/**
 * Defensive backstop: replace any stored key value in `text` with a placeholder,
 * applied in main just before the provider fetch so a key the user pasted into a
 * prompt never leaves the machine (beyond the renderer's regex redaction).
 */
export function scrubKeys(text: string): string {
  let out = text;
  for (const value of Object.values(read())) {
    if (value && value.length >= 8) out = out.split(value).join("[REDACTED_API_KEY]");
  }
  return out;
}
