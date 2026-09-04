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

// The one live DB handle + the file it points at + the account it belongs to. Shared
// module state: every CRUD module reads it via `getClient()` (returns null when the DB
// isn't configured, so callers keep their early-return no-op). `setDbUser` is the ONLY
// thing that opens/closes it, so per-account isolation stays in one place.
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

/**
 * Was the open handle given libSQL's `encryptionKey`? FALSE means the bytes on disk are
 * CLEARTEXT — deliberately so in dev (`store/dbCrypto.ts`), and as a documented FALLBACK in a
 * packaged build whose keychain is unreachable or whose key file is unreadable. It is exported
 * because a caller may hold data whose only allowed home at rest is an ENCRYPTED store, and
 * has to be able to ask rather than assume (`debugLog.ts`). False when no DB is open.
 */
export function isDbEncrypted(): boolean {
  return !!client && encryptedAtRest;
}

async function openDb(file: string): Promise<void> {
  dbFile = file;
  // At-rest encryption (packaged builds only — see dbCrypto.ts). `null` in dev / no
  // keyring → plaintext, so TablePlus inspection is unaffected. A pre-existing
  // plaintext DB is migrated to encrypted ONCE here (with a backup + verify), and if
  // that migration can't complete we fall back to opening plaintext — never a lockout.
  const key = dbEncryptionKey();
  const useKey = key ? await ensureEncrypted(file, key) : false;
  // The native driver is loaded HERE, not at the top of the module: at bundle-load, a
  // `dlopen` refused by the OS kills the process before Sentry and before any guard (`driver.ts`).
  const createClient = await loadDriver();
  client = useKey && key
    ? createClient({ url: `file:${file}`, encryptionKey: key })
    : createClient({ url: `file:${file}` }); // local-only, no syncUrl
  await migrate(client);
  await backfillRedactionKinds(client);
  encryptedAtRest = useKey; // what `isDbEncrypted()` reports to a caller that must ask
  // Remove any CLEARTEXT blobs left on disk from before at-rest blob encryption (F2):
  // when the DB is encrypted, re-encrypt existing plaintext file blobs IN PLACE (once),
  // so no un-encrypted document bytes survive in `userData/files`. No-op in plaintext mode.
  if (useKey) void ensureBlobsEncrypted();
  console.log(`[db] libSQL (local${useKey ? ", encrypted" : ""}) at ${file}`);
}

/**
 * Point the local DB at the SIGNED-IN account's OWN file — per-account isolation so
 * a shared machine never surfaces one account's chats to another. Driven by the
 * renderer (`db:set-user`) on sign-in and on account SWITCH, BEFORE it loads. Closes
 * the previous account's handle first; `null` = signed out (no DB). The pre-isolation
 * shared `userData/openmasq.db` is adopted ONCE by the first account to sign in after
 * the upgrade (`maybeAdoptLegacyDb`) — its owner — then never again, so no OTHER
 * account inherits it and isolation holds thereafter.
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
  // The uid is a Supabase UUID; sanitise defensively so it can never escape the dir.
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe) return;
  const dir = join(app.getPath("userData"), "accounts");
  await mkdir(dir, { recursive: true }).catch(() => {});
  const accountFile = join(dir, `openmasq-${safe}.db`);
  await maybeAdoptLegacyDb(accountFile);
  await openDb(accountFile);
}

/**
 * ONE-TIME recovery of the pre-isolation shared DB. Before per-account isolation,
 * all chats lived in `userData/openmasq.db`; isolation left that file orphaned, so
 * the owner saw an empty account. This adopts it into the FIRST account that signs
 * in after the upgrade — its owner, who just lost their history — then drops a marker
 * so NO OTHER account can inherit it (the isolation guarantee holds from then on).
 * Copies the legacy DB over the freshly-created (empty) account file; a no-op once
 * the marker exists or there's no legacy DB (clean installs).
 *
 * ⚠️ The copy is followed by an UNLINK, and that is the point of the gesture — the same one
 * `store/keys.ts`, `store/secretFile.ts` and `mcp/persist.ts` make. `userData/openmasq.db` is
 * the pre-isolation file: it holds the whole shared history AND the redaction vault, and it
 * is UNENCRYPTED (at-rest encryption came after it). Left behind it was readable by any
 * other account on the machine and by anything that can read the profile dir — the isolation
 * the marker enforces was only ever about who ADOPTS it, never about who can still read it.
 * The `-wal`/`-shm` siblings go too: they carry recent pages in the clear.
 */
async function maybeAdoptLegacyDb(accountFile: string): Promise<void> {
  const userData = app.getPath("userData");
  const marker = join(userData, `.${BRAND.slug}-legacy-db-adopted`);
  // The pre-isolation install base wrote ONE shared file under the product name; an
  // account file adopts it once, then the marker keeps this from ever running again.
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
    // Only AFTER the copy AND the marker: an unlink before either would lose the history
    // outright. Best-effort per file (a locked `-wal` on Windows must not fail adoption) —
    // the marker already prevents a second adoption.
    for (const p of [legacy, `${legacy}-wal`, `${legacy}-shm`]) {
      await rm(p, { force: true }).catch(() => {});
    }
    console.log(`[db] adopted legacy shared db into ${accountFile} (original removed)`);
  } catch (e) {
    // Best-effort: a failed adoption leaves the account empty (data still safe in the
    // legacy file); don't block sign-in.
    console.error("[db] legacy DB adoption failed:", e);
  }
}
