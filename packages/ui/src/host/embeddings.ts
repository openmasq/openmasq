/**
 * The Host's EMBEDDINGS — the Mémoire's semantic index (on-device) and the generic
 * embeddings store. Pulled out of `files.ts` in passing (rule 1: it had just
 * crossed 300 lines) and pulled out THERE precisely: these three interfaces talk about
 * neither files nor extraction — they only lived there for historical reasons. The barrel
 * (`./index`) re-exports everything: no consumer changes.
 */
export interface EmbedConfig {
  model: string;
  baseUrl: string;
  apiKey?: string;
}
export interface EmbeddingHit {
  id: string;
  messageId: string | null;
  conversationId: string | null;
  content: string;
  distance: number;
}
/**
 * Optional MÉMOIRE semantic index — ON-DEVICE embeddings of the memory cards (desktop:
 * bundled e5-small in a worker; the card text NEVER reaches a network embeddings API).
 * `sync` diffs + (re-)embeds + prunes; `edges` returns kNN cosine edges for the
 * clustered Mémoire view. Absent, or `sync` → `available:false` (bundle not baked):
 * the view degrades to the category graph — a convenience, nothing security-relevant.
 */
export interface MemoryIndexHost {
  sync(cards: { id: string; text: string }[]): Promise<{ available: boolean; total: number; indexed: number }>;
  edges(k?: number): Promise<{ a: string; b: string; sim: number }[]>;
  /** Semantic recall text→card (the `memory_search` tier): the query is
   *  embedded ON-DEVICE (e5 prefix `query:`) and compared against the cached vectors.
   *  Optional — an older host / a platform with no bundle doesn't have it, and the
   *  lexical search remains whole. */
  query?(text: string, k?: number): Promise<{ id: string; sim: number }[]>;
}

/** Optional embeddings store (generate + persist + semantic search). */
export interface EmbeddingsHost {
  index(payload: {
    text: string;
    messageId?: string;
    conversationId?: string;
    config: EmbedConfig;
  }): Promise<void>;
  search(payload: {
    query: string;
    k?: number;
    conversationId?: string;
    config: EmbedConfig;
  }): Promise<EmbeddingHit[]>;
}
