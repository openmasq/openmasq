import { getClient } from "./connection";

/**
 * Persistence of the renderer's debug journal (the DebugLogModal's ring buffer).
 * The entries hold WIRE text AND vault values (real PII), so their ONLY allowed
 * home at rest is this per-account, encrypted-at-rest DB — the same at-rest rule
 * as the vault itself. Never a plaintext file, never localStorage, never network.
 *
 * One row in the existing `settings` KV table (key below): the renderer owns the
 * ring's shape and cap (200 entries) and saves the WHOLE buffer, so replace-on-save
 * needs no schema of its own and `clear` is just saving the empty ring.
 */
const KEY = "debug_journal";

/** Refuse a runaway blob rather than bloat the DB: the renderer's 200-entry ring
 *  with capped turn contents stays far below this. Fail closed = skip the save. */
const MAX_JSON_BYTES = 8_000_000;

export async function dbSaveDebugLog(json: string): Promise<void> {
  const client = getClient();
  if (!client || json.length > MAX_JSON_BYTES) return;
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [KEY, json, now, now],
  });
}

export async function dbLoadDebugLog(): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  const res = await client.execute({ sql: "SELECT value FROM settings WHERE key = ?", args: [KEY] });
  const v = res.rows[0]?.value;
  return typeof v === "string" ? v : null;
}
