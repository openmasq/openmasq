import type { Conversation, Message } from "../types";

/**
 * Parser for the OFFICIAL claude.ai data export (`conversations.json` in the archive
 * from claude.ai → Réglages → Confidentialité → Exporter vos données). Pure: JSON in,
 * canonical `Conversation[]` out. Flat structure (no branches): one `chat_messages`
 * list per conversation, `sender` human/assistant, ISO timestamps.
 */

interface ClaudeMessage {
  uuid?: string;
  text?: string;
  sender?: string;
  created_at?: string;
  /** Newer exports carry the text as typed content blocks; `text` stays as a fallback. */
  content?: { type?: string; text?: string }[];
}

interface ClaudeConversation {
  uuid?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
  chat_messages?: ClaudeMessage[];
}

const toMs = (iso: string | undefined): number | undefined => {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : undefined;
};

/** A message's displayable text: joined text blocks, else the legacy `text` field. */
function messageText(m: ClaudeMessage): string {
  if (Array.isArray(m.content)) {
    const joined = m.content
      .filter((b) => b?.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n")
      .trim();
    if (joined) return joined;
  }
  return (m.text ?? "").trim();
}

/** Parse one export payload (the array from `conversations.json`). Unknown shapes are
 *  skipped, never thrown on. */
export function parseClaudeExport(data: unknown, opts: { modelId: string }): Conversation[] {
  if (!Array.isArray(data)) return [];
  const out: Conversation[] = [];
  for (const raw of data as ClaudeConversation[]) {
    if (!raw || typeof raw !== "object" || !raw.uuid || !Array.isArray(raw.chat_messages)) continue;
    const convId = `imp-claude-${raw.uuid}`;

    const messages: Message[] = [];
    for (const m of raw.chat_messages) {
      const role = m.sender === "human" ? "user" : m.sender === "assistant" ? "assistant" : null;
      if (!role) continue;
      const text = messageText(m);
      if (!text) continue;
      messages.push({
        id: `${convId}:m${messages.length}`,
        role,
        content: text,
        at: toMs(m.created_at),
      });
    }
    if (messages.length === 0) continue;

    const createdAt = toMs(raw.created_at) ?? messages[0].at ?? Date.now();
    out.push({
      id: convId,
      title: raw.name?.trim() || "Conversation importée",
      modelId: opts.modelId,
      messages,
      createdAt,
      updatedAt: toMs(raw.updated_at) ?? messages[messages.length - 1].at ?? createdAt,
    });
  }
  return out;
}
