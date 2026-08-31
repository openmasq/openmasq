import {
  isDbConfigured,
  setDbUser,
  dbLoad,
  dbSaveConversation,
  dbDeleteConversation,
  dbSaveSettings,
  dbSaveDebugJournal,
  dbLoadDebugJournal,
  storeEmbedding,
  searchEmbeddings,
  dbSaveEgressJournal,
  dbLoadEgressJournal,
} from "../db";
import { attachEgressSink, listEgress, type EgressRecord } from "../net/egressJournal";
import { embed, probeEndpoint, type EmbedConfig } from "../embeddings";
import { memoryIndexSync, memoryIndexEdges, memoryIndexQuery, type MemoryIndexCard } from "../embed";
import { handle, str, obj, arr, optional, num, nullable } from "./handle";

/**
 * Register the persistence + embeddings IPC — the local Turso/libSQL DB CRUD and the
 * vector index/search. Pure data plane: no read-gate / secret / spawn boundary (those
 * stay in index.ts), just thin wrappers over `../db` + `../embeddings`.
 * (`mcp:set-user` is deliberately NOT here — it re-scopes MCP, not the DB.)
 *
 * Arguments are shape-checked at the boundary (`./handle`) — the annotations below are
 * erased at runtime, and the renderer is untrusted.
 */
export function registerDataIpc(): void {
  // Turso/libSQL persistence (no-ops when TURSO_DATABASE_URL isn't set).
  handle("db:configured", [], () => isDbConfigured());
  // Point the local DB at the signed-in account's file (per-account isolation). The
  // renderer calls this before `db:load` on sign-in / account switch. E2E disables it.
  // `null` is meaningful (signed out), so nullable rather than optional.
  handle("db:set-user", [nullable(str)], async (_e, userId) => {
    if (process.env.OPENMASQ_DISABLE_DB) return;
    await setDbUser(userId);
    // The egress journal is per-account for the same reason the DB is: it describes which
    // services this person talks to. Re-point it in the SAME operation, AFTER the DB handle
    // has moved — attaching first would flush the outgoing account's ring into the incoming
    // account's file. `null` (signed out) detaches, so nothing is recorded until sign-in.
    await attachEgressSink(
      userId
        ? {
            load: async () => {
              const raw = await dbLoadEgressJournal();
              if (!raw) return [];
              const parsed: unknown = JSON.parse(raw);
              return Array.isArray(parsed) ? (parsed as EgressRecord[]) : [];
            },
            save: (records) => dbSaveEgressJournal(JSON.stringify(records)),
          }
        : null,
    ).catch(() => {});
  });
  handle("db:load", [], () => dbLoad());
  handle("db:save-conversation", [obj], (_e, conv) => dbSaveConversation(conv as never));
  handle("db:delete-conversation", [str], (_e, id) => dbDeleteConversation(id));
  handle("db:save-settings", [obj], (_e, settings) => dbSaveSettings(settings as never));
  // The renderer's DEBUG JOURNAL ring (wire text + vault values = real PII): its only
  // at-rest home is this per-account encrypted DB — same rule as the vault. Whole-ring
  // replace on save; content is the renderer's own data, so no gate beyond the shape.
  handle("db:save-debug-journal", [str], (_e, json) => dbSaveDebugJournal(json));
  handle("db:load-debug-journal", [], () => dbLoadDebugJournal());

  // The EGRESS journal — read-only from the renderer. Main is the sole writer (the record
  // would be worthless if the untrusted side could author or erase rows), so there is no
  // `egress:record` and deliberately no `egress:clear`.
  handle("egress:list", [optional(num)], (_e, limit) => listEgress({ limit: limit ?? 500 }));

  // Embeddings: generate (OpenAI-compatible endpoint) + store / search via the
  // local libSQL native vector column.
  handle("embeddings:index", [obj], async (_e, raw) => {
    const payload = raw as {
      text: string;
      messageId?: string;
      conversationId?: string;
      config: EmbedConfig;
    };
    const [vector] = await embed([payload.text], payload.config);
    await storeEmbedding({
      content: payload.text,
      messageId: payload.messageId,
      conversationId: payload.conversationId,
      model: payload.config.model,
      vector,
    });
  });
  handle("embeddings:search", [obj], async (_e, raw) => {
    const payload = raw as {
      query: string;
      k?: number;
      conversationId?: string;
      config: EmbedConfig;
    };
    const [vector] = await embed([payload.query], payload.config);
    return searchEmbeddings(vector, payload.k ?? 5, payload.conversationId);
  });

  // Reachability probe of a self-hosted (openai-compat / Ollama) endpoint — same SSRF
  // allow-list as embeddings, best-effort, for the model picker's joignable/injoignable
  // status. Never throws (returns false on any failure).
  handle("chat:probe-endpoint", [str], (_e, baseUrl) => probeEndpoint(baseUrl));

  // MÉMOIRE semantic index — ON-DEVICE embeddings only (`../embed`, bundled e5-small in
  // a utilityProcess), NEVER the remote `embed()` above: a memory card is real PII.
  handle("memory:index-sync", [arr], (_e, cards) => memoryIndexSync(cards as MemoryIndexCard[]));
  handle("memory:index-edges", [optional(num)], (_e, k) => memoryIndexEdges(k));
  // The semantic recall of `memory_search`: the query is real text — embedded
  // on-device, never routed to the remote embeddings endpoint, never logged.
  handle("memory:index-query", [str, optional(num)], (_e, text, k) => memoryIndexQuery(text, k));
}
