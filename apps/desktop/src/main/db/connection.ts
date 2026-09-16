import { app } from "electron";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import type { Client } from "@libsql/client";
import { loadDriver } from "./driver";
import { dbEncryptionKey } from "../store/dbCrypto";
import { migrate } from "./schema";
import { backfillRedactionKinds } from "./redactionKinds";
import { ensureEncrypted, ensureBlobsEncrypted } from "./encryptedMigration";
import { BRAND } from "@openmasq/branding";

// The one live DB handle. `setDbUser` is the ONLY thing that opens/closes it, so
// per-account isolation stays in one place; `getClient()` is null when no DB is open.
let client: Client | null = null;
let dbFile = "";
let currentUid: string | null = null;
let encryptedAtRest = false;

/** The live DB handle, or null when no account DB is open (the CRUD no-op guard). */
export function getClient(): Client | null {
  return client;
}
export function isDbConfigured(): boolean {
  return !!client;
}
export function databasePath(): string {
  return dbFile;
}

/** FALSE means the bytes on disk are CLEARTEXT (dev, or the packaged fallback without a
 *  keychain). A caller whose data may only live in an ENCRYPTED store asks (`debugLog.ts`). */
export function isDbEncrypted(): boolean {
  return !!client && encryptedAtRest;
}

async function openDb(file: string): Promise<void> {
  dbFile = file;
  // A pre-existing plaintext DB is migrated to encrypted ONCE (backup + verify); a
  // migration that can't complete falls back to plaintext, never a lockout.
  const key = dbEncryptionKey();
  const useKey = key ? await ensureEncrypted(file, key) : false;
  // The native driver loads HERE: a refused `dlopen` at bundle-load kills the process
  // before any guard (`driver.ts`).
  const createClient = await loadDriver();
  client = useKey && key
    ? createClient({ url: `file:${file}`, encryptionKey: key })
    : createClient({ url: `file:${file}` }); // local-only, no syncUrl
  await migrate(client);
  await backfillRedactionKinds(client);
  encryptedAtRest = useKey; // what `isDbEncrypted()` reports to a caller that must ask
  // Re-encrypt any plaintext file blobs IN PLACE (once). No-op in plaintext mode.
  if (useKey) void ensureBlobsEncrypted();
  console.log(`[db] libSQL (local${useKey ? ", encrypted" : ""}) at ${file}`);
}

/**
 * Point the DB at the SIGNED-IN account's OWN file (`db:set-user`, before load): a shared
 * machine never surfaces one account's chats to another. Closes the previous handle first;
 * `null` = signed out. The legacy shared DB is adopted ONCE (`maybeAdoptLegacyDb`).
 */
export async function setDbUser(userId: string | null): Promise<void> {
  if (userId === currentUid && (client || !userId)) return; // already on this account
  try {
    client?.close();
  } catch {
    /* ignore a close error — we drop the handle regardless */
  }
  client = null;
  dbFile = "";
  encryptedAtRest = false;
  currentUid = userId;
  if (!userId) return; // signed out → no local DB
  // Sanitise so the uid can never escape the dir.
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe) return;
  const dir = join(app.getPath("userData"), "accounts");
  await mkdir(dir, { recursive: true }).catch(() => {});
  const accountFile = join(dir, `openmasq-${safe}.db`);
  await maybeAdoptLegacyDb(accountFile);
  await openDb(accountFile);
}

/**
 * ONE-TIME adoption of the pre-isolation shared DB by the FIRST account that signs in, then
 * a marker so NO OTHER account inherits it. ⚠️ The copy is followed by an UNLINK (same
 * gesture as `store/keys.ts` and `mcp/persist.ts`): the shared file holds the whole history
 * AND the vault, UNENCRYPTED, and the marker only governs who ADOPTS it, not who can still
 * read it. The `-wal`/`-shm` siblings carry recent pages in the clear and go too.
 */
async function maybeAdoptLegacyDb(accountFile: string): Promise<void> {
  const userData = app.getPath("userData");
  const marker = join(userData, `.${BRAND.slug}-legacy-db-adopted`);
  const legacy = ["openmasq.db"]
    .map((name) => join(userData, name))
    .find((p) => existsSync(p));
  try {
    if (existsSync(marker)) return; // already adopted (or nothing to adopt) once
    if (!legacy) {
      await writeFile(marker, "no-legacy\n"); // clean install → never look again
      return;
    }
    await copyFile(legacy, accountFile); // the account file is freshly-created/empty
    await writeFile(marker, "adopted\n");
    // Only AFTER the copy AND the marker. Best-effort per file (a locked `-wal` on
    // Windows must not fail adoption).
    for (const p of [legacy, `${legacy}-wal`, `${legacy}-shm`]) {
      await rm(p, { force: true }).catch(() => {});
    }
    console.log(`[db] adopted legacy shared db into ${accountFile} (original removed)`);
  } catch (e) {
    // A failed adoption leaves the account empty (data safe in the legacy file).
    console.error("[db] legacy DB adoption failed:", e);
  }
}
