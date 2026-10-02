// Local-only libSQL persistence, split by concern (hard rule 2). The barrel preserves
// the exact public surface of the former db.ts, so `import … from "../db"` (via
// db/index.ts) is unchanged for every consumer. Shared connection state lives ONLY in
// connection.ts (accessed via getClient); at-rest crypto + per-account isolation are
// isolated in encryptedMigration.ts + connection.ts (rule 7 — verbatim, fail-closed).
export { isDbConfigured, setDbUser } from "./connection";
export {
  dbLoad,
  dbSaveConversation,
  dbDeleteConversation,
  dbSaveSettings,
} from "./conversations";
export { dbSaveDebugLog, dbLoadDebugLog } from "./debugLog";
export { dbSaveEgressLog, dbLoadEgressLog } from "./egressLog";
export {
  dbSaveFile,
  dbListFiles,
  dbConversationsForFile,
  dbLoadFile,
  dbDeleteFile,
  type DbFile,
} from "./files";
export { storeEmbedding, searchEmbeddings } from "./embeddings";
export {
  upsertMemoryEmbedding,
  memoryEmbeddingStatus,
  pruneMemoryEmbeddings,
  allMemoryEmbeddings,
} from "./memoryEmbeddings";
