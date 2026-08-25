import type { Message } from "../../types";

/** What the assistant bubble's MAIN slot renders (the `ToolTrace` card is a separate
 *  slot rendered above it, driven by `toolCall`/`toolCalls`). */
export type AssistantBody = "content" | "thinking" | "none";

/**
 * Decide the assistant bubble's main slot from the message state. THE invariant this
 * enforces: a PENDING turn that has produced no real prose yet must show the
 * "thinking" loader — NEVER a blank bubble.
 *
 * The subtle case this fixes: a model routinely streams a lone "\n"/space around a
 * tool call (so the final `r.text.trim()` is empty — the Debug Log shows "N appel
 * d'outil" with NO "· car. de texte"). That whitespace is a TRUTHY string, so a bare
 * `message.content ? …` check rendered an empty Markdown block AND suppressed the
 * loader → a blank bubble with no spinner for the whole (multi-second) tool-call turn.
 * Deciding on TRIMMED content keeps the loader up until real prose arrives (the full,
 * untrimmed content is still what gets rendered when the "content" slot is chosen).
 */
export function assistantBody(
  message: Pick<Message, "content" | "pending" | "toolCall" | "toolCalls">,
): AssistantBody {
  if (message.content?.trim()) return "content";
  if (message.pending && !message.toolCall && !message.toolCalls?.length) return "thinking";
  return "none";
}

/**
 * Does the loader ride BELOW the answer? True while the turn is still generating and
 * prose has already started.
 *
 * `assistantBody` is exclusive by construction — the first token flips the main slot from
 * `"thinking"` to `"content"`, so the loader vanished the instant the reply began. But the
 * turn is NOT over: the model keeps writing for seconds, and the only remaining motion was
 * text appearing. The user reads a still answer and cannot tell "finished" from "still
 * coming" — the two states looked identical the moment the first word landed.
 *
 * So the loader survives the first token and follows the prose until `pending` clears. It
 * is a separate predicate rather than a fourth `AssistantBody` value on purpose: the main
 * slot stays a single choice (one of three things fills it), and this answers a different
 * question — whether the turn is still alive underneath whatever fills it.
 *
 * ⚠️ The trailing loader carries NO reflection, even from a reasoning model. Once
 * `assistantBody` is `"content"`, `TurnProcess` renders the kept reflection above the
 * answer; streaming it a second time below would print the same text twice — the exact
 * duplication that pairing the two panels prevents (`components/CLAUDE.md`).
 */
export function showsTrailingLoader(
  message: Pick<Message, "content" | "pending" | "toolCall" | "toolCalls">,
): boolean {
  return assistantBody(message) === "content" && !!message.pending;
}
