import type { Client } from "@libsql/client";

/**
 * Local-only libSQL (SQLite) schema + its tiny in-code migration runner (no Knex):
 * each MIGRATIONS entry is applied once and recorded in schema_migrations. libSQL
 * gives us native vector search (F32_BLOB + vector_distance_cos) for the embeddings store.
 */

/** Embedding dimension. Must match your embedding model (OpenAI 3-small = 1536). */
export const EMBED_DIM = 1536;

/** The MÉMOIRE's on-device embedding dimension (multilingual-e5-small = 384). Separate
 *  from EMBED_DIM on purpose: `embeddings` is the remote-endpoint message store, while
 *  `memory_embeddings` may only ever be fed by the LOCAL embedder — a memory card is
 *  real PII whose text must never reach a network embeddings API. */
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
    // Persist each redacted value's category (name/email/phone/company/number)
    // so per-type highlight colours survive a reload.
    name: "0003_redaction_kind",
    statements: [`ALTER TABLE redactions ADD COLUMN kind TEXT`],
  },
  {
    // created_at / updated_at (epoch ms) on every table. conversations already
    // had both; add to the rest and backfill old rows from their conversation
    // (or now() when there's no parent timestamp).
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
    // Attached files: the BYTES live on disk under userData/files; the DB only
    // keeps the PATHS (to the user's original and to the redacted version sent to
    // the model — scrubbed_path is null for a blocked format never uploaded).
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
    // Attached-file references on each message (the chips: name/kind/mime), as
    // JSON — so they survive a reload (DB is the source of truth). The bytes live
    // in the `files` table; this restores the message's display references.
    name: "0007_message_attachments",
    statements: [`ALTER TABLE messages ADD COLUMN attachments TEXT`],
  },
  {
    // Content hash (sha256 of the original bytes) so the SAME file attached to
    // several conversations is recognised as one — powers the library's "used in
    // N conversations" + re-attach. Old rows stay null (no bytes re-hashed).
    name: "0008_file_hash",
    statements: [
      `ALTER TABLE files ADD COLUMN content_hash TEXT`,
      `CREATE INDEX IF NOT EXISTS files_hash_idx ON files (content_hash)`,
    ],
  },
  {
    // Per-message token usage ({model,inputTokens,outputTokens}) as JSON, so the
    // usage stats / prompt counts survive a reload instead of being dropped when
    // the DB load overwrites the localStorage copy. Old rows stay null.
    name: "0009_message_usage",
    statements: [`ALTER TABLE messages ADD COLUMN usage TEXT`],
  },
  {
    // The model id that ACTUALLY produced each assistant reply (pinned at send
    // time) + the tool-struggle hint (JSON) — so switching the conversation's
    // model later doesn't rewrite older badges, and the "try a stronger model"
    // banner survives a reload. Old rows stay null (fall back to usage.model /
    // the current model). Both were previously localStorage-only.
    name: "0010_message_model",
    statements: [
      `ALTER TABLE messages ADD COLUMN model TEXT`,
      `ALTER TABLE messages ADD COLUMN tool_struggle TEXT`,
    ],
  },
  {
    // The failed-turn error DETAIL. The `error` flag was persisted but its text
    // wasn't, so after a reload an errored bubble lost WHY it failed — it showed
    // the generic "La réponse a échoué." with no clue (the specific provider
    // message only lived in the transient send-time state). Persist it so the
    // reason survives a reload. Old rows stay null (fall back to the generic text).
    name: "0011_message_error_text",
    statements: [`ALTER TABLE messages ADD COLUMN error_text TEXT`],
  },
  {
    // The agentic MCP workflow trace (JSON): the ordered tool calls made while
    // producing an assistant reply (connector + tool + ok + result blurb). It was
    // persisted only in localStorage, so a DB-backed reload dropped the trace card
    // entirely. Persist it so the succession of tool calls survives a reload. Old
    // rows stay null (no trace shown, as before).
    name: "0012_message_tool_calls",
    statements: [`ALTER TABLE messages ADD COLUMN tool_calls TEXT`],
  },
  {
    // Whether the assistant reply was cut off (stream interrupted by a quit/reload
    // mid-answer). The DB had NO pending/incomplete column, so a DB-backed reload
    // brought the interrupted reply back as a BLANK, "completed" bubble with no way
    // to retry — the user had to recopy their message. Persist it (folding the
    // transient `pending` into it on save) so the "Réponse interrompue — Réessayer"
    // notice survives a reload. Old rows stay 0 (complete, as before).
    name: "0013_message_incomplete",
    statements: [`ALTER TABLE messages ADD COLUMN incomplete INTEGER DEFAULT 0`],
  },
  {
    // Per-file masked count (distinct redacted values IN that file) so the library
    // card can show "N masqués" without re-deriving it. Old rows stay 0 → the card
    // falls back to a shield with no number until the file is re-saved.
    name: "0014_file_redacted_count",
    statements: [`ALTER TABLE files ADD COLUMN redacted_count INTEGER DEFAULT 0`],
  },
  {
    // Per-conversation REDACTION config (JSON): the "Cette conversation" category
    // override (`redactCategories`), the values sent in clear (`revealedValues`) and
    // the manual "Redact" redactions (`forcedRedactions`). These were localStorage-
    // ONLY, so a DB-backed reload (or the DB-wins merge on account load) DROPPED them —
    // the per-conversation redaction rules silently reverted to the global defaults.
    // Persist so they survive a reload. Old rows stay null (fall back to global).
    name: "0015_conversation_redaction_config",
    statements: [`ALTER TABLE conversations ADD COLUMN redaction_config TEXT`],
  },
  {
    // The compétence sent with a user message (JSON `{id, name, prompt}`): its prompt
    // rides the model payload, not `content`, so the tag on the bubble is its only
    // trace. The DB had no column, and the load merge is "DB wins" — so a reload
    // dropped the tag entirely, even though localStorage deliberately keeps `id`/`name`
    // (`send/sendGuards.ts` strips only the `prompt`, which is real user text and
    // belongs here, encrypted). Old rows stay null → no tag, as before.
    name: "0016_message_competence",
    statements: [`ALTER TABLE messages ADD COLUMN competence TEXT`],
  },
  {
    // The file's EXTRACTION (JSON `{text, ocrText?, words?, ocr?}`) — the OCR/parse result,
    // persisted so a RE-ATTACH reuses it instead of re-running OCR. Raw real PII, so it
    // rides the ENCRYPTED DB (never localStorage). Old rows stay null → the reattach path
    // falls back to re-extraction. Sits in the DB (not a sidecar) because the DB column is
    // already encrypted at rest; `words` can be bulky for a multi-page scan (accepted).
    name: "0017_file_extraction",
    statements: [`ALTER TABLE files ADD COLUMN extraction TEXT`],
  },
  {
    // Semantic-recall cache for the MÉMOIRE: one vector per card (or the "profile"
    // sentinel), computed ON-DEVICE. Deliberately NO raw-text column — the card text
    // lives in Settings; this table holds only the vector plus what invalidation
    // needs (`model` = which local embedder produced it, `text_hash` = sha256 of the
    // embedded surface, so an edited card re-embeds and a model upgrade drops the
    // cache wholesale). Re-derivable ⇒ best-effort in the encrypted migration, like
    // `embeddings`. No ANN index: a memory holds tens-to-hundreds of cards, and an
    // exact vector_distance_cos scan at that scale is faster than maintaining one.
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
    // The model's REFLECTION for an assistant turn — the chain of thought a reasoning
    // model streams beside its answer, un-redacted through the conversation's vault.
    // It used to be dropped the instant the answer landed, so the one thing explaining
    // a 40-second turn vanished exactly when the user could have read it. This DB is
    // its ONLY at-rest home: it holds real values and is unbounded, so the plaintext
    // localStorage mirror strips it (`ui` `stripVaultForLocal`). Old rows stay null →
    // no « Réflexion » line, as before.
    name: "0019_message_reasoning",
    statements: [`ALTER TABLE messages ADD COLUMN reasoning TEXT`],
  },
  {
    // How an AUTO-mode turn was billed ("free" | "byo" | "metered"), stamped at send
    // time. It is a claim about MONEY (« via votre abonnement »), so it must survive a
    // reload — deriving it later from the conversation's current mode would mislabel
    // turns sent before a switch to Auto. Old rows stay null → no caption, as before.
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
