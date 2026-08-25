import { existsSync } from "node:fs";
import { writeFile, readFile, rm, copyFile, rename, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { dbEncryptionKey, encryptBytes, looksEncrypted } from "../store/dbCrypto";
import { migrate } from "./schema";
import { filesDir } from "./paths";

/**
 * One-time sweep that ELIMINATES pre-existing plaintext file blobs: it walks
 * `userData/files` and re-encrypts (in place, 0600) any blob that isn't already ours,
 * so the cleartext form no longer exists on disk. Runs only when at-rest encryption is
 * active (a DB key is available — packaged / keyring); a no-op otherwise, so dev blobs
 * stay plaintext like the dev DB. Marker-guarded (`.encrypted`) so it runs at most once;
 * the DB encryption key is global (one `db-key.enc`), so a single sweep covers every
 * account's blobs. Best-effort — a failure on one file is skipped, never fatal.
 */
export async function ensureBlobsEncrypted(): Promise<void> {
  const key = dbEncryptionKey();
  if (!key) return; // plaintext mode → nothing to strip
  const dir = filesDir();
  const marker = join(dir, ".encrypted");
  if (!existsSync(dir) || existsSync(marker)) return;
  try {
    const names = await readdir(dir).catch(() => [] as string[]);
    let converted = 0;
    for (const name of names) {
      if (name.startsWith(".")) continue;
      const p = join(dir, name);
      try {
        const raw = new Uint8Array(await readFile(p));
        if (looksEncrypted(raw)) continue; // already encrypted → leave as-is
        await writeFile(p, encryptBytes(raw), { mode: 0o600 });
        converted++;
      } catch {
        /* unreadable / not a file → skip */
      }
    }
    await writeFile(marker, "1", { mode: 0o600 });
    if (converted) console.log(`[db] re-encrypted ${converted} plaintext file blob(s) at rest`);
  } catch (err) {
    console.error("[db] blob re-encryption sweep failed (will retry next launch):", err);
  }
}

/** True if `file` can be opened + queried (with `key` when given). Throwaway client. */
async function probeOpens(file: string, key?: string): Promise<boolean> {
  let c: Client | null = null;
  try {
    c = createClient(key ? { url: `file:${file}`, encryptionKey: key } : { url: `file:${file}` });
    await c.execute("SELECT count(*) FROM sqlite_master");
    return true;
  } catch {
    return false;
  } finally {
    try {
      c?.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Make sure `file` is encrypted with `key`. Returns whether it's safe to OPEN with the
 * key. Fresh file → created encrypted (true). Already encrypted with our key → true.
 * Opens with NEITHER key nor plaintext (corrupt / key lost) → leave as-is, let the real
 * open surface it (true). Plaintext legacy → migrate ONCE; on any migration failure we
 * keep the untouched plaintext file and return FALSE (open plaintext this session).
 */
export async function ensureEncrypted(file: string, key: string): Promise<boolean> {
  if (!existsSync(file)) return true; // will be created encrypted by createClient
  if (await probeOpens(file, key)) {
    // F5 (data-at-rest): purge any `.plain.bak` a PRIOR migration left behind — it's a
    // full CLEARTEXT copy of the chats + vault sitting next to the encrypted DB. The DB
    // is confirmed encrypted here, so the backup is pure residual risk.
    if (existsSync(`${file}.plain.bak`)) await rm(`${file}.plain.bak`, { force: true }).catch(() => {});
    return true; // already encrypted with our key
  }
  if (!(await probeOpens(file))) {
    console.error("[db] existing DB opens with neither the key nor plaintext — leaving as-is");
    return true; // let the real open throw a clear error rather than us guessing
  }
  try {
    await migratePlaintextToEncrypted(file, key);
    return true;
  } catch (e) {
    console.error("[db] encryption migration FAILED — opening plaintext this session:", e);
    return false; // the original plaintext file is untouched (swap happens last)
  }
}

/**
 * One-time migration of a PLAINTEXT libSQL DB to an encrypted one. libSQL can't add a
 * key to an existing plaintext file, so we copy row-by-row into a fresh encrypted DB,
 * verify per-table counts, then atomically swap. A `.plain.bak` backup of the original
 * is kept only until the encrypted copy verifies, then PURGED (F5 — it would otherwise
 * be a permanent cleartext copy). The `embeddings` table (a re-derivable vector cache with
 * F32_BLOB values) is best-effort — its failure is logged and skipped, never aborting;
 * every other table (chats / messages / the VAULT) must copy exactly or we abort and
 * keep plaintext (no data loss).
 */
async function migratePlaintextToEncrypted(file: string, key: string): Promise<void> {
  const bak = `${file}.plain.bak`;
  const tmp = `${file}.enc.tmp`;
  console.log(`[db] migrating plaintext DB → encrypted: ${file}`);
  await copyFile(file, bak); // safety net BEFORE we touch anything
  if (existsSync(tmp)) await rm(tmp).catch(() => {});

  const src = createClient({ url: `file:${file}` });
  const dst = createClient({ url: `file:${tmp}`, encryptionKey: key });
  try {
    await migrate(dst); // code-defined schema on the fresh encrypted DB
    const tables = await src.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'",
    );
    for (const row of tables.rows as any[]) {
      const name = String(row.name);
      try {
        const data = await src.execute(`SELECT * FROM "${name}"`);
        if (data.rows.length) {
          const cols = data.columns;
          const sql = `INSERT INTO "${name}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols
            .map(() => "?")
            .join(",")})`;
          const stmts = (data.rows as any[]).map((r) => ({ sql, args: cols.map((c) => r[c]) }));
          for (let i = 0; i < stmts.length; i += 500) await dst.batch(stmts.slice(i, i + 500), "write");
        }
        const sc = Number((await src.execute(`SELECT count(*) n FROM "${name}"`)).rows[0]!.n);
        const dc = Number((await dst.execute(`SELECT count(*) n FROM "${name}"`)).rows[0]!.n);
        if (sc !== dc) throw new Error(`row-count mismatch on "${name}": ${sc} != ${dc}`);
      } catch (e) {
        if (name === "embeddings" || name === "memory_embeddings") {
          console.warn(`[db] migration: skipping re-derivable table "${name}":`, e);
          continue; // vectors regenerate; never block the crown-jewels migration
        }
        throw e; // any real-data table failing → abort (caller keeps plaintext)
      }
    }
  } finally {
    try {
      src.close();
    } catch {
      /* ignore */
    }
    try {
      dst.close();
    } catch {
      /* ignore */
    }
  }
  await rm(file);
  await rename(tmp, file);
  // F5 (data-at-rest): the `.plain.bak` is a full CLEARTEXT copy of the chats + vault.
  // Keep it ONLY if the freshly-encrypted DB fails to reopen (recovery) — otherwise it
  // is a permanent plaintext bypass of the at-rest encryption. Verify, then purge.
  if (await probeOpens(file, key)) {
    await rm(bak, { force: true }).catch(() => {});
    console.log(`[db] migration complete; plaintext backup purged`);
  } else {
    console.error(`[db] migrated DB failed to reopen — keeping plaintext backup at ${bak}`);
  }
}
