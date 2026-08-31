// The MÉMOIRE semantic index — the main-process orchestration between the renderer's
// cards (real text, which the renderer already owns), the on-device embed worker and
// the per-account `memory_embeddings` cache (encrypted DB, vectors + invalidation keys
// only — never raw text). Two IPC-facing entry points:
//   `memoryIndexSync(cards)`  — diff by (model, sha256(text)), embed what moved, prune
//                               deleted cards' vectors (data minimisation);
//   `memoryIndexEdges(k)`     — kNN semantic edges over the cached vectors, for the
//                               clustered Mémoire view. Pure math in `./knn.ts`.
import { createHash } from "node:crypto";
import {
  allMemoryEmbeddings,
  memoryEmbeddingStatus,
  pruneMemoryEmbeddings,
  upsertMemoryEmbedding,
} from "../db";
import { embedAvailable, embedTexts } from "./client";
import { E5_PASSAGE_PREFIX, E5_QUERY_PREFIX, EMBED_MODEL_TAG } from "./model";
import { knnEdges, knnQuery, type SemanticEdge } from "./knn";

export interface MemoryIndexCard {
  id: string;
  /** The card's embeddable surface (entity + aliases + facts), REAL text. */
  text: string;
}

const hashText = (t: string): string => createHash("sha256").update(t, "utf8").digest("hex");

/** Bound one worker message — a fresh memory of hundreds of cards embeds in waves. */
const BATCH = 16;

export interface MemoryIndexState {
  /** False when the bundle is absent (bake not run / platform without it) — the caller
   *  renders the non-semantic view; nothing else changes. */
  available: boolean;
  total: number;
  indexed: number;
}

export async function memoryIndexSync(cards: MemoryIndexCard[]): Promise<MemoryIndexState> {
  if (!embedAvailable()) return { available: false, total: cards.length, indexed: 0 };
  const status = new Map((await memoryEmbeddingStatus()).map((s) => [s.cardId, s]));
  const stale = cards.filter((c) => {
    const s = status.get(c.id);
    return !s || s.model !== EMBED_MODEL_TAG || s.textHash !== hashText(c.text);
  });
  for (let i = 0; i < stale.length; i += BATCH) {
    const batch = stale.slice(i, i + BATCH);
    const vectors = await embedTexts(batch.map((c) => E5_PASSAGE_PREFIX + c.text));
    for (let j = 0; j < batch.length; j++) {
      await upsertMemoryEmbedding({
        cardId: batch[j].id,
        model: EMBED_MODEL_TAG,
        textHash: hashText(batch[j].text),
        vector: vectors[j],
      });
    }
  }
  // A deleted card must not leave a vector of its PII behind.
  await pruneMemoryEmbeddings(cards.map((c) => c.id));
  return { available: true, total: cards.length, indexed: cards.length };
}

export async function memoryIndexEdges(k = 3): Promise<SemanticEdge[]> {
  if (!embedAvailable()) return [];
  const rows = await allMemoryEmbeddings(EMBED_MODEL_TAG);
  return knnEdges(
    rows.map((r) => ({ id: r.cardId, vector: r.vector })),
    k,
  );
}

/** The SEMANTIC recall behind `memory_search`: the query (real text, never logged) is
 *  embedded on-device with the QUERY prefix — e5 is asymmetric, the prefix carries
 *  meaning (`./model.ts`) — then compared against the cached vectors. Returns ids + cosine;
 *  the FLOOR belongs to the UI (`@openmasq/ui` memory/select.ts), same as for the
 *  edges. Unavailable (bundle absent) ⇒ `[]` — lexical search remains intact. */
export async function memoryIndexQuery(text: string, k = 4): Promise<{ id: string; sim: number }[]> {
  if (!embedAvailable() || !text.trim()) return [];
  const rows = await allMemoryEmbeddings(EMBED_MODEL_TAG);
  if (!rows.length) return [];
  const [query] = await embedTexts([E5_QUERY_PREFIX + text]);
  return knnQuery(
    query,
    rows.map((r) => ({ id: r.cardId, vector: r.vector })),
    k,
  );
}
