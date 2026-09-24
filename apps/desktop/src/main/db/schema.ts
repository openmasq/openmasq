import type { Client } from "@libsql/client";

/**
 * Local-only libSQL schema + its in-code migration runner: each entry is applied once and
 * recorded in schema_migrations. Migrations are append-only; a column's meaning is in its
 * migration comment, once.
 */

/** Embedding dimension. Must match your embedding model (OpenAI 3-small = 1536). */
export const EMBED_DIM = 1536;

/** The MEMORY's on-device embedding dimension. Separate from EMBED_DIM on purpose:
 *  `memory_embeddings` may only ever be fed by the LOCAL embedder (a memory card is real
 *  PII that must never reach a network embeddings API). */
export const MEMORY_EMBED_DIM = 384;

const MIGRATIONS: { name: string; statements: string[] }[] = [
  {
    name: "0001_init",
    statements: [
      `CREATE TABLE IF NOT EXISTS conversations (
         id TEXT PRIMARY KEY, title TEXT, model_id TEXT,
         created_at INTEGER, updated_at INTEGER
       )`,
      `CREATE TABLE IF NOT EXISTS messages (
         id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT,
         content TEXT, redactions INTEGER DEFAULT 0, error INTEGER DEFAULT 0, ord INTEGER
       )`,
      `CREATE TABLE IF NOT EXISTS redactions (
         conversation_id TEXT NOT NULL, placeholder TEXT NOT NULL, value TEXT NOT NULL,
         PRIMARY KEY (conversation_id, placeholder)
       )`,
      `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
    ],
  },
  {
    name: "0002_embeddings",
    statements: [
      // Native libSQL vector column. rowid is used by the ANN index.
      `CREATE TABLE IF NOT EXISTS embeddings (
         id TEXT PRIMARY KEY,
         message_id TEXT,
         conversation_id TEXT,
         model TEXT,
         content TEXT,
         embedding F32_BLOB(${EMBED_DIM}),
         created_at INTEGER
       )`,
      // ANN index (cosine). Exact search via vector_distance_cos also works.
      `CREATE INDEX IF NOT EXISTS embeddings_vec_idx
         ON embeddings (libsql_vector_idx(embedding))`,
    ],
  },
  {
    // Each redacted value's category, for per-type highlight colours.
    name: "0003_redaction_kind",
    statements: [`ALTER TABLE redactions ADD COLUMN kind TEXT`],
  },
  {
    // created_at / updated_at (epoch ms) on every table, backfilled from the conversation.
    name: "0005_timestamps",
    statements: [
      `ALTER TABLE messages ADD COLUMN created_at INTEGER`,
      `ALTER TABLE messages ADD COLUMN updated_at INTEGER`,
      `ALTER TABLE redactions ADD COLUMN created_at INTEGER`,
      `ALTER TABLE redactions ADD COLUMN updated_at INTEGER`,
      `ALTER TABLE settings ADD COLUMN created_at INTEGER`,
      `ALTER TABLE settings ADD COLUMN updated_at INTEGER`,
      `ALTER TABLE embeddings ADD COLUMN updated_at INTEGER`,
      `UPDATE messages SET created_at = COALESCE(
         (SELECT created_at FROM conversations c WHERE c.id = messages.conversation_id),
         CAST(strftime('%s','now') AS INTEGER) * 1000) WHERE created_at IS NULL`,
      `UPDATE messages SET updated_at = COALESCE(
         (SELECT updated_at FROM conversations c WHERE c.id = messages.conversation_id),
         CAST(strftime('%s','now') AS INTEGER) * 1000) WHERE updated_at IS NULL`,
      `UPDATE redactions SET created_at = COALESCE(
         (SELECT created_at FROM conversations c WHERE c.id = redactions.conversation_id),
         CAST(strftime('%s','now') AS INTEGER) * 1000) WHERE created_at IS NULL`,
      `UPDATE redactions SET updated_at = COALESCE(
         (SELECT updated_at FROM conversations c WHERE c.id = redactions.conversation_id),
         CAST(strftime('%s','now') AS INTEGER) * 1000) WHERE updated_at IS NULL`,
      `UPDATE settings SET created_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE created_at IS NULL`,
      `UPDATE settings SET updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE updated_at IS NULL`,
      `UPDATE embeddings SET updated_at = created_at WHERE updated_at IS NULL`,
    ],
  },
  {
    // Attached files: the BYTES live under userData/files, the DB keeps the PATHS
    // (scrubbed_path is null for a blocked format).
    name: "0006_files",
    statements: [
      `CREATE TABLE IF NOT EXISTS files (
         id TEXT PRIMARY KEY,
         conversation_id TEXT,
         name TEXT,
         mime TEXT,
         redacted INTEGER DEFAULT 0,
         original_path TEXT,
         scrubbed_path TEXT,
         created_at INTEGER
       )`,
      `CREATE INDEX IF NOT EXISTS files_conv_idx ON files (conversation_id)`,
    ],
  },
  {
    // Attached-file references on each message (the chips), as JSON.
    name: "0007_message_attachments",
    statements: [`ALTER TABLE messages ADD COLUMN attachments TEXT`],
  },
  {
    // sha256 of the original bytes, so the SAME file across conversations is one.
    name: "0008_file_hash",
    statements: [
      `ALTER TABLE files ADD COLUMN content_hash TEXT`,
      `CREATE INDEX IF NOT EXISTS files_hash_idx ON files (content_hash)`,
    ],
  },
  {
    // Per-message token usage ({model,inputTokens,outputTokens}) as JSON.
    name: "0009_message_usage",
    statements: [`ALTER TABLE messages ADD COLUMN usage TEXT`],
  },
  {
    // The model that ACTUALLY produced each reply (pinned at send time) + the
    // tool-struggle hint (JSON).
    name: "0010_message_model",
    statements: [
      `ALTER TABLE messages ADD COLUMN model TEXT`,
      `ALTER TABLE messages ADD COLUMN tool_struggle TEXT`,
    ],
  },
  {
    // The failed-turn error DETAIL (null ⇒ the generic text).
    name: "0011_message_error_text",
    statements: [`ALTER TABLE messages ADD COLUMN error_text TEXT`],
  },
  {
    // The agentic workflow trace (JSON): the ordered tool calls behind a reply.
    name: "0012_message_tool_calls",
    statements: [`ALTER TABLE messages ADD COLUMN tool_calls TEXT`],
  },
  {
    // Whether the reply was cut off mid-stream (the transient `pending` folds into it
    // on save), so the "Réessayer" notice survives a reload.
    name: "0013_message_incomplete",
    statements: [`ALTER TABLE messages ADD COLUMN incomplete INTEGER DEFAULT 0`],
  },
  {
    // Distinct redacted values IN that file, for the library card.
    name: "0014_file_redacted_count",
    statements: [`ALTER TABLE files ADD COLUMN redacted_count INTEGER DEFAULT 0`],
  },
  {
    // Per-conversation REDACTION config (JSON): category override, revealed values,
    // forced redactions. Null ⇒ the global defaults.
    name: "0015_conversation_redaction_config",
    statements: [`ALTER TABLE conversations ADD COLUMN redaction_config TEXT`],
  },
  {
    // The skill sent with a user message (JSON `{id, name, prompt}`). The `prompt` is
    // real user text: it belongs here, encrypted, never in localStorage.
    name: "0016_message_competence",
    statements: [`ALTER TABLE messages ADD COLUMN competence TEXT`],
  },
  {
    // The file's EXTRACTION (JSON), so a RE-ATTACH skips OCR. Raw real PII: it rides the
    // ENCRYPTED DB, never localStorage.
    name: "0017_file_extraction",
    statements: [`ALTER TABLE files ADD COLUMN extraction TEXT`],
  },
  {
    // Semantic-recall cache for the MEMORY, computed ON-DEVICE. NO raw-text column: only
    // the vector plus what invalidation needs (`model`, `text_hash`). No ANN index: an
    // exact scan over hundreds of cards beats maintaining one.
    name: "0018_memory_embeddings",
    statements: [
      `CREATE TABLE IF NOT EXISTS memory_embeddings (
         card_id TEXT PRIMARY KEY,
         model TEXT NOT NULL,
         text_hash TEXT NOT NULL,
         embedding F32_BLOB(${MEMORY_EMBED_DIM}) NOT NULL,
         updated_at INTEGER
       )`,
    ],
  },
  {
    // The model's REASONING for a turn, un-redacted through the vault. This DB is its
    // ONLY at-rest home (real values, unbounded): the localStorage mirror strips it.
    name: "0019_message_reasoning",
    statements: [`ALTER TABLE messages ADD COLUMN reasoning TEXT`],
  },
  {
    // How an AUTO-mode turn was billed, stamped at send time: a claim about MONEY,
    // never re-derived from the conversation's current mode.
    name: "0020_message_auto_routed",
    statements: [`ALTER TABLE messages ADD COLUMN auto_routed TEXT`],
  },
];

export async function migrate(c: Client): Promise<void> {
  await c.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER)`,
  );
  const done = new Set<string>();
  const res = await c.execute("SELECT name FROM schema_migrations");
  for (const r of res.rows as any[]) done.add(r.name);

  for (const m of MIGRATIONS) {
    if (done.has(m.name)) continue;
    await c.batch(m.statements, "write");
    await c.execute({
      sql: "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
      args: [m.name, Date.now()],
    });
    console.log(`[db] applied migration ${m.name}`);
  }
}
