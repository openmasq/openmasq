// Local-only libSQL persistence, split by concern (hard rule 2). The barrel preserves
// the exact public surface of the former db.ts, so `import … from "../db"` (via
// db/index.ts) is unchanged for every consumer. Shared connection state lives ONLY in
// connection.ts (accessed via getClient); at-rest crypto + per-account isolation are
// isolated in encryptedMigration.ts + connection.ts (rule 7 — verbatim, fail-closed).
export { EMBED_DIM } from "./schema";
export { isDbConfigured, databasePath, setDbUser } from "./connection";
export {
  dbLoad,
  dbSaveConversation,
  dbDeleteConversation,
  dbSaveSettings,
} from "./conversations";
export { dbSaveDebugJournal, dbLoadDebugJournal } from "./debugJournal";
export { dbSaveEgressJournal, dbLoadEgressJournal } from "./egressJournal";
export {
  dbSaveFile,
  dbListFiles,
  dbConversationsForFile,
  dbLoadFile,
  dbDeleteFile,
  type DbFile,
} from "./files";
export { storeEmbedding, searchEmbeddings, type EmbeddingRow, type SearchHit } from "./embeddings";
export { MEMORY_EMBED_DIM } from "./schema";
export {
  upsertMemoryEmbedding,
  memoryEmbeddingStatus,
  pruneMemoryEmbeddings,
  searchMemoryEmbeddings,
  allMemoryEmbeddings,
  type MemoryEmbeddingRow,
  type MemoryEmbeddingHit,
} from "./memoryEmbeddings";
