import type { Message } from "../../../types";
import { hasFailedTool } from "../../ToolTrace";

/**
 * THE decision behind the one « turn status » slot under a reply: what, if anything,
 * the app has to say about how this turn ended. One reason at a time, in priority
 * order — a turn that errored is not ALSO « interrupted », and a failed tool step under
 * an errored turn is already told by the error.
 *
 * Four reasons wear the same card (`FailedTurnCard`), one gets the richer credits card:
 *  - `credits` — a platform send blocked on credits on a FREE account (`credit_options`),
 *    whatever the `error` flag says: the amber card IS the message;
 *  - `error` — the persisted failure (`errorText`, survives reload), red;
 *  - `interrupted` / `empty` — the stream was cut (reload/quit mid-answer) or the model
 *    returned nothing. Not an error: no red, just « this answer is incomplete »;
 *  - `tool` — the trace ended on a FAILED step but the turn itself settled (the model
 *    may have written after). Without it a failed flow with no final text showed nothing.
 *
 * Pure, so `MessageBubble` renders ONE `<TurnStatus>` instead of four conditionals.
 */
type TurnStatusReason = "error" | "interrupted" | "empty" | "tool";
export type TurnOutcome = { kind: "card"; reason: TurnStatusReason } | { kind: "credits" } | null;

export function turnStatusOf(
  m: Pick<Message, "pending" | "error" | "errorAction" | "incomplete" | "content" | "toolCalls">,
): TurnOutcome {
  if (m.pending) return null;
  if (m.errorAction?.kind === "credit_options") return { kind: "credits" };
  if (m.error) return { kind: "card", reason: "error" };
  if (m.incomplete) return { kind: "card", reason: m.content?.trim() ? "interrupted" : "empty" };
  if (hasFailedTool(m.toolCalls)) return { kind: "card", reason: "tool" };
  return null;
}
