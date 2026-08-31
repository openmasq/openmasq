import { getClient } from "./connection";
import type { DbConversation } from "./types";

/**
 * The SAVE for a conversation — pulled out of `conversations.ts` (300 LOC cap, rule 1);
 * the public name doesn't move (re-exported by `conversations.ts`, barrel unchanged).
 */
/** Serialize a conversation's per-conv redaction config to the `redaction_config`
 *  JSON column — only the non-empty parts, or null when there's nothing to persist
 *  (so a conversation with no overrides keeps a clean null, not `{}`). */
function redactionConfigJson(conv: DbConversation): string | null {
  const cfg: Record<string, unknown> = {};
  if (conv.redactCategories && Object.keys(conv.redactCategories).length)
    cfg.redactCategories = conv.redactCategories;
  if (conv.revealedValues?.length) cfg.revealedValues = conv.revealedValues;
  if (conv.forcedRedactions?.length) cfg.forcedRedactions = conv.forcedRedactions;
  // The per-conversation fake-mapping salt (secret) rides the redaction config blob, so it
  // is owned by the encrypted DB — never a plaintext column, never lost on the DB-wins merge.
  if (typeof conv.redactionSalt === "number") cfg.redactionSalt = conv.redactionSalt;
  if (conv.redactionMode === "token") cfg.redactionMode = conv.redactionMode;
  if (typeof conv.memoryWatermark === "number") cfg.memoryWatermark = conv.memoryWatermark;
  return Object.keys(cfg).length ? JSON.stringify(cfg) : null;
}

export async function dbSaveConversation(conv: DbConversation): Promise<void> {
  const client = getClient();
  if (!client) return;
  // ⚠️ ANTI-ERASURE GUARD (13/08 loss). A conversation with NO messages at all that would
  // overwrite when the DB holds some is a SKELETON (state not yet hydrated, or a sync
  // convMeta applied before loading), never a user action: nothing in the app empties a
  // conversation's messages — full deletion goes through dbDeleteConversation.
  // The mirror "reflects memory state" becomes destructive in this one case; we then
  // preserve messages, vault (redactions) AND redaction_config (the SALT lives there —
  // overwriting it with null would make future fakes unstable). Only meta is written.
  const skeleton =
    conv.messages.length === 0 &&
    Number(
      (
        await client.execute({
          sql: "SELECT count(*) AS n FROM messages WHERE conversation_id = ?",
          args: [conv.id],
        })
      ).rows[0]?.n ?? 0,
    ) > 0;
  if (skeleton)
    console.error(
      `[db] save REFUSÉ d'effacer les messages stockés de ${conv.id} (conversation vide reçue — squelette)`,
    );
  const now = Date.now();
  // original value -> kind, gathered from every message's redacted spans, so we
  // can persist each redaction's category alongside its placeholder + value.
  const kindByValue: Record<string, string> = { ...(conv.redactionKinds ?? {}) };
  for (const m of conv.messages)
    for (const s of m.redactedSpans ?? []) kindByValue[s.value] = s.kind;

  const ids = conv.messages.map((m) => m.id);

  const stmts: { sql: string; args: any[] }[] = [
    {
      // In skeleton mode, redaction_config keeps the STORED value when the incoming
      // value is null (COALESCE) — same signal, same protection as for messages.
      sql: `INSERT INTO conversations (id, title, model_id, created_at, updated_at, redaction_config)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET title=excluded.title, model_id=excluded.model_id,
              updated_at=excluded.updated_at,
              redaction_config=${skeleton ? "COALESCE(excluded.redaction_config, conversations.redaction_config)" : "excluded.redaction_config"}`,
      args: [
        conv.id,
        conv.title,
        conv.modelId,
        conv.createdAt,
        conv.updatedAt,
        redactionConfigJson(conv),
      ],
    },
  ];
  if (skeleton) {
    await client.batch(stmts, "write");
    return;
  }
  stmts.push(
    // Drop messages no longer in the conversation, then upsert the rest so each
    // message keeps its original created_at and only bumps updated_at.
    ids.length
      ? {
          sql: `DELETE FROM messages WHERE conversation_id = ? AND id NOT IN (${ids
            .map(() => "?")
            .join(",")})`,
          args: [conv.id, ...ids],
        }
      : { sql: "DELETE FROM messages WHERE conversation_id = ?", args: [conv.id] },
    ...conv.messages.map((m, i) => ({
      sql: `INSERT INTO messages (id, conversation_id, role, content, redactions, error, error_text, ord, created_at, updated_at, attachments, usage, model, auto_routed, tool_struggle, tool_calls, incomplete, competence, reasoning)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET role=excluded.role, content=excluded.content,
              redactions=excluded.redactions, error=excluded.error, error_text=excluded.error_text, ord=excluded.ord,
              updated_at=excluded.updated_at, attachments=excluded.attachments, usage=excluded.usage,
              model=excluded.model, auto_routed=excluded.auto_routed, tool_struggle=excluded.tool_struggle, tool_calls=excluded.tool_calls,
              incomplete=excluded.incomplete, competence=excluded.competence, reasoning=excluded.reasoning`,
      args: [
        m.id,
        conv.id,
        m.role,
        m.content,
        m.redactions ?? 0,
        m.error ? 1 : 0,
        m.errorText ?? null,
        i,
        now,
        now,
        m.attachments?.length ? JSON.stringify(m.attachments) : null,
        m.usage ? JSON.stringify(m.usage) : null,
        m.model ?? null,
        m.autoRouted ?? null,
        m.toolStruggle ? JSON.stringify(m.toolStruggle) : null,
        m.toolCalls?.length ? JSON.stringify(m.toolCalls) : null,
        // Fold the transient `pending` (live loader) into `incomplete`: a reply
        // saved mid-stream then interrupted reloads as incomplete → offers Réessayer.
        m.incomplete || m.pending ? 1 : 0,
        m.competence ? JSON.stringify(m.competence) : null,
        m.reasoning || null,
      ],
    })),
    { sql: "DELETE FROM redactions WHERE conversation_id = ?", args: [conv.id] },
    ...Object.entries(conv.redactionVault ?? {}).map(([placeholder, value]) => ({
      sql: "INSERT INTO redactions (conversation_id, placeholder, value, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [conv.id, placeholder, value, kindByValue[value] ?? null, now, now],
    })),
  );
  await client.batch(stmts, "write");
}
