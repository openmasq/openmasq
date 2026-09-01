/**
 * The tooled-turn SWITCHBOARD, kept out of `main/index.ts` (rule 1: this file is
 * a frozen ceiling, and one more wiring would have dug it deeper) and stored with the family
 * it serves (rule 2).
 *
 * A single question: is this provider served by a subscription CLI that can carry the
 * app's TOOLS? If so, the tooled turn answers it with the `completeWithTools` contract;
 * otherwise `null`, and the caller resumes its normal path (key + egress). The question
 * has ONE home, `subscriptionToolsCli` (rule 9) — allowed to be NARROWER than the text
 * turn's list, should a CLI serve text without being able to carry the bridge (none does
 * today: antigravity's recipe was measured on 01/09/2026, `antigravityToolsTurn.ts`).
 */
import type { ChatMessage, CompleteToolsResult, ToolDef } from "@openmasq/llm";
import { subscriptionToolsCli, subscriptionTurnEnv } from "./desktop";
import { completeSubscriptionTools } from "./toolsTurn";

export interface SubscriptionToolsRequest {
  provider: string;
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
}

export interface SubscriptionToolsHooks {
  signal: AbortSignal;
  /** Assistant text as it streams in (streamed path). */
  onDelta?: (text: string) => void;
  onReasoning?: (delta: string) => void;
}

/**
 * The subscription's tooled turn, or `null` if this provider isn't one.
 * The calling agentic loop sees no difference from a key-based model: the
 * MCP bridge CAPTURES the tool call (`toolsBridge.ts`), it never executes it — so
 * the vault and the write gate remain the app's own.
 */
export function subscriptionToolsRoute(
  req: SubscriptionToolsRequest,
  hooks: SubscriptionToolsHooks,
): Promise<CompleteToolsResult> | null {
  const cli = subscriptionToolsCli(req.provider);
  if (!cli) return null;
  return completeSubscriptionTools(subscriptionTurnEnv(cli), {
    messages: req.messages,
    tools: req.tools ?? [],
    modelId: req.model,
    signal: hooks.signal,
    onDelta: hooks.onDelta,
    onReasoning: hooks.onReasoning,
  });
}
