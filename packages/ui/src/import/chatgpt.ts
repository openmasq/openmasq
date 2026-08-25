import type { Conversation, Message } from "../types";

/**
 * Parser for the OFFICIAL ChatGPT data export (`conversations.json` in the zip from
 * chatgpt.com → Réglages → Contrôles des données → Exporter). Pure: JSON in,
 * canonical `Conversation[]` out — no host, no network.
 *
 * The export stores each conversation as a TREE of nodes (`mapping` +
 * `current_node`): regenerations fork branches, and the active thread is the parent
 * chain of `current_node`. We walk that chain (the thread the user last saw), keep
 * only real user/assistant text turns, and drop tool/system/hidden nodes.
 */

interface GptNode {
  id?: string;
  parent?: string | null;
  message?: {
    author?: { role?: string };
    create_time?: number | null;
    content?: { content_type?: string; parts?: unknown[] };
    metadata?: { is_visually_hidden_from_conversation?: boolean };
  } | null;
}

interface GptConversation {
  id?: string;
  conversation_id?: string;
  title?: string;
  create_time?: number;
  update_time?: number;
  mapping?: Record<string, GptNode>;
  current_node?: string;
}

/** Export timestamps are epoch SECONDS (float); ours are ms. */
const toMs = (t: number | null | undefined): number | undefined =>
  typeof t === "number" && t > 0 ? Math.round(t < 1e12 ? t * 1000 : t) : undefined;

/** A node's displayable text: the string parts of a text/multimodal message joined
 *  (image parts are objects — skipped; the beta imports text only). */
function nodeText(node: GptNode): string {
  const c = node.message?.content;
  if (!c || !Array.isArray(c.parts)) return "";
  if (c.content_type !== "text" && c.content_type !== "multimodal_text") return "";
  return c.parts.filter((p): p is string => typeof p === "string").join("\n").trim();
}

/** Walk the active branch: current_node → … → root, then reverse to reading order. */
function activeChain(mapping: Record<string, GptNode>, leaf: string | undefined): GptNode[] {
  const chain: GptNode[] = [];
  const seen = new Set<string>(); // corrupt exports can cycle — never loop forever
  let cur = leaf;
  while (cur && mapping[cur] && !seen.has(cur)) {
    seen.add(cur);
    chain.push(mapping[cur]);
    cur = mapping[cur].parent ?? undefined;
  }
  return chain.reverse();
}

/** Parse one export payload (the array from `conversations.json`). Unknown shapes are
 *  skipped, never thrown on — an export mixing schema versions still yields the rest. */
export function parseChatGptExport(data: unknown, opts: { modelId: string }): Conversation[] {
  if (!Array.isArray(data)) return [];
  const out: Conversation[] = [];
  for (const raw of data as GptConversation[]) {
    if (!raw || typeof raw !== "object" || !raw.mapping) continue;
    const sourceId = raw.conversation_id ?? raw.id;
    if (!sourceId) continue;
    const convId = `imp-gpt-${sourceId}`;

    const messages: Message[] = [];
    for (const node of activeChain(raw.mapping, raw.current_node)) {
      const role = node.message?.author?.role;
      if (role !== "user" && role !== "assistant") continue;
      if (node.message?.metadata?.is_visually_hidden_from_conversation) continue;
      const text = nodeText(node);
      if (!text) continue;
      messages.push({
        id: `${convId}:m${messages.length}`,
        role,
        content: text,
        at: toMs(node.message?.create_time),
      });
    }
    if (messages.length === 0) continue;

    const createdAt = toMs(raw.create_time) ?? messages[0].at ?? Date.now();
    out.push({
      id: convId,
      title: raw.title?.trim() || "Conversation importée",
      modelId: opts.modelId,
      messages,
      createdAt,
      updatedAt: toMs(raw.update_time) ?? messages[messages.length - 1].at ?? createdAt,
    });
  }
  return out;
}
