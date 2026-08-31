import { rm } from "node:fs/promises";
import { getClient } from "./connection";
import { filesDir } from "./paths";
import { isUnderDir } from "./safePath";
import type { DbMessage, DbConversation } from "./types";

export async function dbLoad(): Promise<{
  conversations: DbConversation[];
  settings: unknown | null;
} | null> {
  const client = getClient();
  if (!client) return null;
  const [convs, msgs, reds, setts] = await Promise.all([
    client.execute("SELECT * FROM conversations ORDER BY updated_at DESC"),
    client.execute("SELECT * FROM messages ORDER BY ord ASC"),
    client.execute("SELECT * FROM redactions"),
    client.execute("SELECT value FROM settings WHERE key = 'app'"),
  ]);

  const msgsByConv = new Map<string, DbMessage[]>();
  for (const r of msgs.rows as any[]) {
    const list = msgsByConv.get(r.conversation_id) ?? [];
    let attachments: DbMessage["attachments"];
    if (r.attachments) {
      try {
        attachments = JSON.parse(r.attachments);
      } catch {
        /* corrupt JSON → just drop the chips, don't break the load */
      }
    }
    let usage: DbMessage["usage"];
    if (r.usage) {
      try {
        usage = JSON.parse(r.usage);
      } catch {
        /* corrupt JSON → drop usage, don't break the load */
      }
    }
    let toolStruggle: DbMessage["toolStruggle"];
    if (r.tool_struggle) {
      try {
        toolStruggle = JSON.parse(r.tool_struggle);
      } catch {
        /* corrupt JSON → drop the hint, don't break the load */
      }
    }
    let toolCalls: DbMessage["toolCalls"];
    if (r.tool_calls) {
      try {
        toolCalls = JSON.parse(r.tool_calls);
      } catch {
        /* corrupt JSON → drop the trace, don't break the load */
      }
    }
    let competence: DbMessage["competence"];
    if (r.competence) {
      try {
        competence = JSON.parse(r.competence);
      } catch {
        /* corrupt JSON → drop the tag, don't break the load */
      }
    }
    list.push({
      id: r.id,
      role: r.role,
      content: r.content ?? "",
      redactions: Number(r.redactions) || undefined,
      error: r.error ? true : undefined,
      incomplete: r.incomplete ? true : undefined,
      errorText: r.error_text || undefined,
      attachments: attachments?.length ? attachments : undefined,
      usage,
      model: r.model ?? undefined,
      autoRouted: r.auto_routed ?? undefined,
      toolStruggle,
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      competence,
      reasoning: r.reasoning || undefined,
    });
    msgsByConv.set(r.conversation_id, list);
  }
  const vaultByConv = new Map<string, Record<string, string>>();
  const kindsByConv = new Map<string, Record<string, string>>();
  for (const r of reds.rows as any[]) {
    const v = vaultByConv.get(r.conversation_id) ?? {};
    v[r.placeholder] = r.value;
    vaultByConv.set(r.conversation_id, v);
    if (r.kind) {
      const k = kindsByConv.get(r.conversation_id) ?? {};
      k[r.value] = r.kind;
      kindsByConv.set(r.conversation_id, k);
    }
  }

  const conversations: DbConversation[] = (convs.rows as any[]).map((r) => {
    // Per-conversation redaction config (category override + reveals + manual
    // redactions) — a JSON blob; a corrupt/absent value just falls back to global.
    let redaction: {
      redactCategories?: Record<string, boolean>;
      revealedValues?: string[];
      forcedRedactions?: { value: string; category: string }[];
      redactionSalt?: number;
      redactionMode?: "fake" | "token";
      memoryWatermark?: number;
    } = {};
    if (r.redaction_config) {
      try {
        redaction = JSON.parse(r.redaction_config) ?? {};
      } catch {
        /* corrupt JSON → global defaults, don't break the load */
      }
    }
    return {
      id: r.id,
      title: r.title ?? "New chat",
      modelId: r.model_id,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
      messages: msgsByConv.get(r.id) ?? [],
      redactionVault: vaultByConv.get(r.id) ?? {},
      redactionKinds: kindsByConv.get(r.id) ?? {},
      redactCategories:
        redaction.redactCategories && Object.keys(redaction.redactCategories).length
          ? redaction.redactCategories
          : undefined,
      revealedValues: redaction.revealedValues?.length ? redaction.revealedValues : undefined,
      forcedRedactions: redaction.forcedRedactions?.length ? redaction.forcedRedactions : undefined,
      redactionSalt: typeof redaction.redactionSalt === "number" ? redaction.redactionSalt : undefined,
      // The redaction mode (fakes ⇄ markers) is pinned on the conversation: without it
      // on reload, a conversation in tokens would revert to fakes on the next turn.
      redactionMode: redaction.redactionMode === "token" ? "token" : undefined,
      memoryWatermark: typeof redaction.memoryWatermark === "number" ? redaction.memoryWatermark : undefined,
    };
  });

  let settings: unknown | null = null;
  const sv = (setts.rows as any[])[0]?.value;
  if (typeof sv === "string") {
    try {
      settings = JSON.parse(sv);
    } catch {
      settings = null;
    }
  }
  return { conversations, settings };
}

export { dbSaveConversation } from "./saveConversation";

export async function dbDeleteConversation(id: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  // Remove the conversation's file blobs from disk before dropping the rows.
  const files = await client.execute({
    sql: "SELECT original_path, scrubbed_path FROM files WHERE conversation_id = ?",
    args: [id],
  });
  await Promise.all(
    files.rows.flatMap((r) =>
      [r.original_path, r.scrubbed_path]
        .filter((p): p is string => typeof p === "string")
        // SECURITY: never unlink outside our files dir — a poisoned/legacy row must not
        // turn a conversation delete into an arbitrary file deletion (mirrors dbDeleteFile).
        .filter((p) => isUnderDir(p, filesDir()))
        .map((p) => rm(p, { force: true }).catch(() => {})),
    ),
  );
  await client.batch(
    [
      { sql: "DELETE FROM messages WHERE conversation_id = ?", args: [id] },
      { sql: "DELETE FROM redactions WHERE conversation_id = ?", args: [id] },
      { sql: "DELETE FROM files WHERE conversation_id = ?", args: [id] },
      { sql: "DELETE FROM conversations WHERE id = ?", args: [id] },
    ],
    "write",
  );
}

export async function dbSaveSettings(settings: unknown): Promise<void> {
  const client = getClient();
  if (!client) return;
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO settings (key, value, created_at, updated_at) VALUES ('app', ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [JSON.stringify(settings), now, now],
  });
}
