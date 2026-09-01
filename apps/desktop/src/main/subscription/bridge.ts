/**
 * The bridge between OpenMasq's `streamChat` contract (STATELESS: the whole history on
 * every turn) and the CLI (STATEFUL: its own session).
 *
 * ## Why we flatten, and why it isn't a stopgap
 *
 * Three paths exist; two are dead ends, measured:
 *
 * 1. `--input-format stream-json` — discarded. Observed on CLI 2.1.241: each `user`
 *    message in the stream is executed as a SEPARATE TURN (two messages ⇒ two `result`s,
 *    two responses). It's a live conversation, not a history
 *    preload: replaying N past turns into it would REPLAY them and re-bill them.
 *
 * 2. `--resume <session>` — the "native" path, and the cheapest: we'd only send
 *    the last message, the CLI keeping the context. Discarded for now because
 *    `StreamChatOptions` carries NO conversation identifier, and above all because
 *    the CLI's session DIVERGES as soon as the user edits, regenerates or deletes
 *    a turn — three ordinary gestures in a chat. OpenMasq would stop being the source
 *    of truth for its own conversation. Worth revisiting if we plumb through a
 *    conversation id (see the note at the bottom of `CLAUDE.md`).
 *
 * 3. Flattening the history into a prompt, a fresh session every turn — chosen. This is
 *    EXACTLY what every other OpenMasq provider already does (the full `messages`
 *    on every call): same cost, same semantics, no possible divergence, and zero
 *    contract change.
 */
import type { ChatMessage } from "@openmasq/llm";

/** Role labels for the transcript. Explicit: the model reads a dialogue, not a block. */
const ROLE_LABEL: Record<string, string> = {
  user: "Utilisateur",
  assistant: "Assistant",
  tool: "Résultat d'outil",
};

export interface FlattenedTurn {
  /** The `system` messages, joined — passed as `--system-prompt`. */
  system?: string;
  /** The rest, as transcript. Empty = nothing to send (the caller must refuse the turn). */
  prompt: string;
}

/**
 * `ChatMessage[]` → a CLI turn.
 *
 * A deliberate special case: a conversation of a SINGLE user message is
 * sent BARE, with no role label — it's the most frequent case (first message),
 * and decorating it with "User:" would drift the tone of the response for nothing.
 */
export function flattenForCli(messages: ChatMessage[]): FlattenedTurn {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join("\n\n");

  const turns = messages.filter((m) => m.role !== "system");

  if (turns.length === 1 && turns[0].role === "user") {
    return { system: system || undefined, prompt: turns[0].content.trim() };
  }

  const prompt = turns
    .map((m) => {
      const label = ROLE_LABEL[m.role] ?? m.role;
      return `${label} :\n${m.content.trim()}`;
    })
    .filter((block) => !block.endsWith(":\n"))
    .join("\n\n");

  return { system: system || undefined, prompt: prompt.trim() };
}

/**
 * A CLI with NO system field (codex, antigravity) gets the system prompt PREFIXED to the
 * turn, clearly separated. One home for the two of them (rule 9): the day this wording
 * changes, both say the same thing — a copy in each engine is how they drift apart.
 */
export function promptWithSystem(system: string | undefined, prompt: string): string {
  return system ? `Instructions système :\n${system}\n\n---\n\n${prompt}` : prompt;
}

/**
 * Attachments don't go through this path: the headless CLI takes text, not
 * image blocks. Flagging it EARLY and clearly beats letting them silently
 * drop — the user would see the model "ignore" their capture without understanding why.
 */
export function hasUnsupportedAttachments(messages: ChatMessage[]): boolean {
  return messages.some((m) => (m.attachments?.length ?? 0) > 0);
}
