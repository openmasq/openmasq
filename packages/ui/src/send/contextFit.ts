import { contextWindow } from "@openmasq/llm";
import { estimateTokens } from "@openmasq/llm/wire";
import { isAutoModelId } from "./autoRoute";

/**
 * Does this message even FIT the chosen model? Asked before anything else of the send —
 * masking a 300-page paste for a 128K model only to have the provider refuse it costs the
 * user minutes and tells them nothing they can act on.
 *
 * What is measured: the typed text plus the text of every staged file (a folded document
 * rides the payload whole). NOT the history: the send already slides the history to the
 * window (`historyWindow.ts`) and always keeps the current turn, so the current turn is what
 * can overflow on its own. Nor the system prompt or tool schemas — leaving them out makes the
 * estimate a FLOOR of the real payload, which is the safe side for a refusal.
 *
 * The estimate is the shared `chars/4` (`@openmasq/llm/wire` `estimateTokens`). Prose in a
 * Latin script runs closer to 4.5 characters per token, so chars/4 can overshoot by ~12%;
 * a refusal therefore needs the estimate to pass the window by {@link CONTEXT_REFUSE_MARGIN}.
 * Below that, the send goes ahead and the provider stays the backstop. An unknown window
 * (a local model) or the Auto model (it picks a model that fits) is never refused.
 */
export const CONTEXT_REFUSE_MARGIN = 1.25;

export type ContextOverflow = { modelId: string; tokens: number; limit: number };

export function contextOverflow(p: {
  modelId: string | undefined;
  text: string;
  files: readonly { text: string }[];
}): ContextOverflow | null {
  if (!p.modelId || isAutoModelId(p.modelId)) return null;
  const limit = contextWindow(p.modelId);
  if (!limit) return null;
  const tokens = estimateTokens(p.text) + p.files.reduce((n, f) => n + estimateTokens(f.text), 0);
  return tokens > limit * CONTEXT_REFUSE_MARGIN ? { modelId: p.modelId, tokens, limit } : null;
}

/** A token count the way a model card says it: « 128K », « 1M », « 1.05M » — the model
 *  picker's window figure and the refusal below speak the same unit. */
export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 10_000) / 100}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}
