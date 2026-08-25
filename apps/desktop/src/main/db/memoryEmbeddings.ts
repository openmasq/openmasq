import { getClient } from "./connection";
import { MEMORY_EMBED_DIM } from "./schema";

/**
 * CRUD for `memory_embeddings` — the MÉMOIRE's on-device semantic-recall cache.
 * One row per card id (the profile rides the "profile" sentinel). Holds NO raw text:
 * the vector plus its invalidation key (`model`, `text_hash`), so the caller diffs
 * `memoryEmbeddingStatus` against the live cards to know what to (re-)embed and what
 * to prune. Vectors here may only ever come from the LOCAL embedder — never wire this
 * table to the remote `embed()` path (`../embeddings.ts`): a card's text is real PII.
 */

export interface MemoryEmbeddingRow {
  cardId: string;
  /** The local embedder that produced the vector (id@dtype) — a model change makes
   *  every other-model row stale, filtered out of search and pruned by the caller. */
  model: string;
  /** sha256 of the embedded surface (entity + aliases + facts) — an edited card no
   *  longer matches and gets re-embedded. */
  textHash: string;
  vector: number[];
}

export async function upsertMemoryEmbedding(row: MemoryEmbeddingRow): Promise<void> {
  const client = getClient();
  if (!client) return;
  if (row.vector.length !== MEMORY_EMBED_DIM) {
    throw new Error(
      `Memory embedding has ${row.vector.length} dims, expected ${MEMORY_EMBED_DIM}. Adjust MEMORY_EMBED_DIM + re-migrate.`,
    );
  }
  await client.execute({
    sql: `INSERT INTO memory_embeddings (card_id, model, text_hash, embedding, updated_at)
          VALUES (?, ?, ?, vector32(?), ?)
          ON CONFLICT(card_id) DO UPDATE SET
            model = excluded.model, text_hash = excluded.text_hash,
            embedding = excluded.embedding, updated_at = excluded.updated_at`,
    args: [row.cardId, row.model, row.textHash, JSON.stringify(row.vector), Date.now()],
  });
}

/** What is cached, per card — the caller diffs this against the live memory to decide
 *  which cards need (re-)embedding (missing / hash moved / other model). */
export async function memoryEmbeddingStatus(): Promise<
  { cardId: string; model: string; textHash: string }[]
> {
  const client = getClient();
  if (!client) return [];
  const res = await client.execute("SELECT card_id, model, text_hash FROM memory_embeddings");
  return (res.rows as any[]).map((r) => ({
    cardId: String(r.card_id),
    model: String(r.model),
    textHash: String(r.text_hash),
  }));
}

/** Drop every row NOT in `keepCardIds` — a deleted card must not leave a vector of its
 *  PII behind (re-derivable, but data minimisation still applies). Empty keep = wipe. */
export async function pruneMemoryEmbeddings(keepCardIds: string[]): Promise<void> {
  const client = getClient();
  if (!client) return;
  if (!keepCardIds.length) {
    await client.execute("DELETE FROM memory_embeddings");
    return;
  }
  await client.execute({
    sql: `DELETE FROM memory_embeddings WHERE card_id NOT IN (${keepCardIds.map(() => "?").join(",")})`,
    args: keepCardIds,
  });
}

/** Every cached vector of one embedder — the clustering path loads them all (a memory
 *  is tens-to-hundreds of rows; see the 0018 exact-scan note). */
export async function allMemoryEmbeddings(
  model: string,
): Promise<{ cardId: string; vector: number[] }[]> {
  const client = getClient();
  if (!client) return [];
  const res = await client.execute({
    sql: "SELECT card_id, vector_extract(embedding) AS v FROM memory_embeddings WHERE model = ?",
    args: [model],
  });
  return (res.rows as any[]).map((r) => ({
    cardId: String(r.card_id),
    vector: JSON.parse(String(r.v)) as number[],
  }));
}

export interface MemoryEmbeddingHit {
  cardId: string;
  /** Cosine distance (0 = identical, 2 = opposite) — the caller owns the cut-off. */
  distance: number;
}

/** Nearest cards to a query vector, SAME embedder only (a stale other-model row can't
 *  produce a meaningful distance). Exact scan — see the 0018 migration note. */
export async function searchMemoryEmbeddings(
  vector: number[],
  model: string,
  k = 5,
): Promise<MemoryEmbeddingHit[]> {
  const client = getClient();
  if (!client) return [];
  if (vector.length !== MEMORY_EMBED_DIM) {
    throw new Error(`Query vector has ${vector.length} dims, expected ${MEMORY_EMBED_DIM}.`);
  }
  const res = await client.execute({
    sql: `SELECT card_id, vector_distance_cos(embedding, vector32(?)) AS distance
          FROM memory_embeddings WHERE model = ?
          ORDER BY distance ASC LIMIT ?`,
    args: [JSON.stringify(vector), model, k],
  });
  return (res.rows as any[]).map((r) => ({
    cardId: String(r.card_id),
    distance: Number(r.distance),
  }));
}
