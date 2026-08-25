import type { ChatMessage } from "@openmasq/llm";
import { estimateMessageTokens } from "./historyWindow";

/**
 * Token counts for a turn that ended WITHOUT the provider's terminal usage frame.
 *
 * Why this exists: the real numbers only ever arrive in the last SSE frame. Press Stop,
 * or have the stream drop mid-answer, and that frame never comes — so the turn used to
 * record NO usage at all and counted as zero in Réglages → Usage. That is the one wrong
 * answer available: the provider bills the tokens it generated whether or not we received
 * the count, and on the app's own gateway the credits ARE debited for exactly this case
 * (its metering sits in a `finally` and falls back to an estimate — audit M5). A local
 * total of zero therefore drifted further from the real bill with every interruption.
 *
 * The estimate is the same cheap `chars/4` heuristic as the context window and the tool
 * router — precision is not the point, being off by ~10% beats being off by 100%.
 *
 * ⚠️ Count the WIRE, not what the user sees. `history` is the redacted payload and
 * `output` the raw stream accumulator, so both are what the provider actually processed;
 * de-redacted text has a different length and would be the wrong string to measure.
 */
export function estimateTurnUsage(
  history: ChatMessage[],
  output: string,
): { inputTokens: number; outputTokens: number } {
  return {
    inputTokens: history.reduce((n, m) => n + estimateMessageTokens(m), 0),
    outputTokens: estimateMessageTokens({ role: "assistant", content: output }),
  };
}
