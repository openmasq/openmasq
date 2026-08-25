import { app } from "electron";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, copyFile, writeFile } from "node:fs/promises";
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

async function openDb(file: string): Promise<void> {
  dbFile = file;
  // At-rest encryption (packaged builds only — see dbCrypto.ts). `null` in dev / no
  // keyring → plaintext, so TablePlus inspection is unaffected. A pre-existing
  // plaintext DB is migrated to encrypted ONCE here (with a backup + verify), and if
  // that migration can't complete we fall back to opening plaintext — never a lockout.
  const key = dbEncryptionKey();
  const useKey = key ? await ensureEncrypted(file, key) : false;
  // Le pilote natif se charge ICI, pas en tête de module : au chargement du bundle, un
  // `dlopen` refusé par l'OS tue le processus avant Sentry et avant toute garde (`driver.ts`).
  const createClient = await loadDriver();
  client = useKey && key
    ? createClient({ url: `file:${file}`, encryptionKey: key })
    : createClient({ url: `file:${file}` }); // local-only, no syncUrl
  await migrate(client);
  await backfillRedactionKinds(client);
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
 */
async function maybeAdoptLegacyDb(accountFile: string): Promise<void> {
  const userData = app.getPath("userData");
  const marker = join(userData, `.${BRAND.slug}-legacy-db-adopted`);
  // Les DEUX noms se tentent : le parc pré-isolation a écrit son fichier sous l'ANCIEN
  // nom de code du dépôt (renommé le 24/08/2026 — le renommage n'a pas touché les
  // disques), et "openmasq.db" couvre le nom courant. Exception nommée de `check:brand`.
  const legacy = ["openmasq.db", "openmasq.db"]
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
    console.log(`[db] adopted legacy shared db into ${accountFile}`);
  } catch (e) {
    // Best-effort: a failed adoption leaves the account empty (data still safe in the
    // legacy file); don't block sign-in.
    console.error("[db] legacy DB adoption failed:", e);
  }
}
