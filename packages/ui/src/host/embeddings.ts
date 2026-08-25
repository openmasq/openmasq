/**
 * Les EMBEDDINGS du Host — l'index sémantique de la Mémoire (on-device) et le store
 * d'embeddings générique. Sorti de `files.ts` en passant (règle 1 : il venait de
 * franchir les 300 lignes) et sorti LÀ précisément : ces trois interfaces ne parlent
 * ni de fichiers ni d'extraction — elles n'y vivaient que par histoire. Le barrel
 * (`./index`) ré-exporte tout : aucun consommateur ne change.
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
  /** Rappel sémantique texte→fiche (le tier de `memory_search`) : la requête est
   *  embarquée SUR L'APPAREIL (préfixe e5 `query:`) et comparée aux vecteurs en cache.
   *  Optionnel — un host plus ancien / une plateforme sans bundle n'en a pas, et la
   *  recherche lexicale reste entière. */
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
