import { getClient } from "./connection";

/**
 * At-rest home for the egress journal (`net/egressJournal.ts`).
 *
 * The entries hold no PII and no path — origin, source, verdict — but they DO describe the
 * user's browsing and which services they connect to, which is exactly the kind of profile
 * the product exists to keep off other people's machines. So the same at-rest rule as the
 * vault and the debug journal applies: this per-account, encrypted-at-rest DB, and nowhere
 * else. Never a plaintext file, never localStorage, never the network.
 *
 * One row in the existing `settings` KV table: the ring's shape and cap belong to the
 * writer, which saves the WHOLE buffer, so replace-on-save needs no schema of its own.
 */
const KEY = "egress_journal";

/** ~2000 entries of ~120 bytes is well under this; a bigger blob means something upstream
 *  lost its cap, and bloating the DB is the worse failure. Fail closed = skip the save. */
const MAX_JSON_BYTES = 4_000_000;

export async function dbSaveEgressLog(json: string): Promise<void> {
  const client = getClient();
  if (!client || json.length > MAX_JSON_BYTES) return;
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [KEY, json, now, now],
  });
}

export async function dbLoadEgressLog(): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  const res = await client.execute({ sql: "SELECT value FROM settings WHERE key = ?", args: [KEY] });
  const v = res.rows[0]?.value;
  return typeof v === "string" ? v : null;
}
