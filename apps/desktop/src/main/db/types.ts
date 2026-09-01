// Internal DB row shapes for conversations + messages. Not re-exported from the db
// barrel (they were module-private in the original db.ts) — the public API is the
// db* functions; these describe what dbLoad returns / dbSaveConversation accepts.

export interface DbMessage {
  id: string;
  role: string;
  content: string;
  redactions?: number;
  error?: boolean;
  /** Live loader flag (stream in progress) — carried only on the way IN (save
   *  folds it into `incomplete`); never read back out of the DB. */
  pending?: boolean;
  /** The reply was cut off mid-stream (quit/reload) — restored so the "Réponse
   *  interrompue — Réessayer" notice survives a reload. */
  incomplete?: boolean;
  /** Why the turn failed (provider/tool message), persisted so the reason
   *  survives a reload instead of degrading to a generic "failed" line. */
  errorText?: string;
  /** Sensitive spans + their kind, so the value->kind map can be persisted. */
  redactedSpans?: { value: string; kind: string }[];
  /** Attached-file references (chips) — restored so files survive a reload. */
  attachments?: { name: string; kind: string; mime?: string }[];
  /** Token usage for the model reply, so stats survive a reload. */
  usage?: { model: string; inputTokens: number; outputTokens: number };
  /** Model id that produced this reply — pinned so its badge survives a reload. */
  model?: string;
  /** AUTO mode: how the routed turn was billed — persisted so the « choisi
   *  automatiquement · via votre abonnement » caption survives a reload. */
  autoRouted?: "free" | "byo" | "metered";
  /** "try a stronger model" hint, persisted so it survives a reload. */
  toolStruggle?: {
    tool: string;
    server: string;
    model: string;
    kind: "arg_error" | "no_tool_used";
  };
  /** Agentic MCP workflow trace (ordered tool calls), persisted so the trace card
   *  survives a reload. */
  toolCalls?: { tool: string; server: string; ok: boolean; summary?: string }[];
  /** The compétence this message was sent with — the tag on the bubble, plus the
   *  SNAPSHOT of the instruction that actually went out. `prompt` is real user text
   *  (a template routinely keeps the example pasted in while drafting it), so this
   *  DB is its only home: the plaintext localStorage copy keeps `id`/`name` alone. */
  competence?: { id: string; name: string; prompt?: string };
  /** The model's REFLECTION for this turn (already un-redacted). Real values, and
   *  unbounded — this DB is its only at-rest home; the plaintext localStorage copy
   *  strips it, like `competence.prompt`. */
  reasoning?: string;
}
export interface DbConversation {
  id: string;
  title: string;
  modelId: string;
  messages: DbMessage[];
  createdAt: number;
  updatedAt: number;
  redactionVault?: Record<string, string>;
  /** original value -> kind, reconstructed from the redactions table on load. */
  redactionKinds?: Record<string, string>;
  /** Per-conversation redaction config (persisted as the `redaction_config` JSON
   *  column): the "Cette conversation" category override + reveals + manual redactions. */
  redactCategories?: Record<string, boolean>;
  revealedValues?: string[];
  forcedRedactions?: { value: string; category: string }[];
  /** Per-conversation fake-mapping salt (secret) — persisted inside `redaction_config`,
   *  so it is owned by the encrypted DB, never a plaintext column. */
  redactionSalt?: number;
  redactionKey?: string;
  /** What the model sees for THIS conversation: plausible fakes (default) or
   *  `[PERSON1]` markers. Pinned at its first redaction, so persisted with the salt. */
  redactionMode?: "fake" | "token";
  /** Auto-memory extraction cursor (a count — not sensitive). */
  memoryWatermark?: number;
}
