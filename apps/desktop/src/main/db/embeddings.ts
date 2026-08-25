import { randomUUID } from "node:crypto";
import { getClient } from "./connection";
import { EMBED_DIM } from "./schema";

export interface EmbeddingRow {
  messageId?: string;
  conversationId?: string;
  model?: string;
  content: string;
  vector: number[];
}

/** Store one embedding. The vector is serialised for libSQL's vector32(). */
export async function storeEmbedding(row: EmbeddingRow): Promise<void> {
  const client = getClient();
  if (!client) return;
  if (row.vector.length !== EMBED_DIM) {
    throw new Error(
      `Embedding has ${row.vector.length} dims, expected ${EMBED_DIM}. Adjust EMBED_DIM + re-migrate.`,
    );
  }
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO embeddings (id, message_id, conversation_id, model, content, embedding, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, vector32(?), ?, ?)`,
    args: [
      randomUUID(),
      row.messageId ?? null,
      row.conversationId ?? null,
      row.model ?? null,
      row.content,
      JSON.stringify(row.vector),
      now,
      now,
    ],
  });
}

export interface SearchHit {
  id: string;
  messageId: string | null;
  conversationId: string | null;
  content: string;
  distance: number;
}

/**
 * Nearest-neighbour search over stored embeddings using libSQL's native cosine
 * distance. Exact scan (always correct); for large sets switch to the ANN index
 * via vector_top_k('embeddings_vec_idx', vector32(?), k).
 */
export async function searchEmbeddings(
  vector: number[],
  k = 5,
  conversationId?: string,
): Promise<SearchHit[]> {
  const client = getClient();
  if (!client) return [];
  const where = conversationId ? "WHERE conversation_id = ?" : "";
  const args: any[] = [JSON.stringify(vector)];
  if (conversationId) args.push(conversationId);
  args.push(k);
  const res = await client.execute({
    sql: `SELECT id, message_id, conversation_id, content,
                 vector_distance_cos(embedding, vector32(?)) AS distance
          FROM embeddings ${where}
          ORDER BY distance ASC
          LIMIT ?`,
    args,
  });
  return (res.rows as any[]).map((r) => ({
    id: r.id,
    messageId: r.message_id ?? null,
    conversationId: r.conversation_id ?? null,
    content: r.content ?? "",
    distance: Number(r.distance),
  }));
}
