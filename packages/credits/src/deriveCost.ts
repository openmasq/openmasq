import { MODEL_PRICING, isFreeModel, isFreeModeModel } from "@openmasq/llm/pricing";
import type { TokenUsage } from "@openmasq/llm/wire";

// Re-exported so the gateway (which depends on @openmasq/credits, not llm directly)
// can skip the credit block for free models — the same single-source definition.
//
// ⚠️ TWO predicates, and they don't answer the same question. `isFreeModel` = "it
// costs nothing to bill" (price 0/0). `isFreeModeModel` = "an account with no
// subscription or key is allowed to run it on OUR key" — a named list, shorter. It's the
// second one that guards access; the first stays the meter's rule.
export { isFreeModel, isFreeModeModel };

// USD→EUR conversion for turning list prices into a budget. Approximate on
// purpose (the whole cost is an estimate, not a bill); tune in one place.
// NOTE: Scaleway platform models are priced in EUR in the registry; the ×0.92
// here slightly under-counts them — within the approximate-budget tolerance.
export const USD_TO_EUR = 0.92;

/** Server-derived credit cost (eurocents) of a model turn. Unpriced models
 *  (keyless web sessions, local) → 0. Rounds up so any priced usage costs ≥1.
 *  Prices come from the SINGLE source `@openmasq/llm/pricing` — no hand-kept
 *  mirror to drift. */
export function deriveCreditCents(
  model: string | null,
  tokensIn: number,
  tokensOut: number,
): number {
  const p = model ? MODEL_PRICING[model] : undefined;
  if (!p) return 0;
  const usd = (tokensIn / 1e6) * p.in + (tokensOut / 1e6) * p.out;
  const cents = usd * USD_TO_EUR * 100;
  return cents <= 0 ? 0 : Math.ceil(cents);
}

// ---- Prompt-cache weighting ----
// A cached prompt is not billed at the input price. Anthropic's published
// multipliers, applied to the counters `TokenUsage` reports as PARTS of
// `inputTokens`: a cache READ costs ≈0.1× input, a cache WRITE ≈1.25×.
export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_MULTIPLIER = 1.25;

/**
 * The token counts to METER for one turn, from the canonical {@link TokenUsage}.
 *
 * ⚠️ Only ever hand this a usage whose provider EXCLUDES the cache from its own input
 * count and therefore had it folded back in (Anthropic — see `@openmasq/llm/wire`).
 * An OpenAI-shaped `prompt_tokens` already bills the cached part at the input price
 * upstream, so discounting it here would meter LESS than the app pays.
 *
 * The bug this exists to close: metering Anthropic's raw `input_tokens` charged
 * NOTHING for a cached prompt — the app paid for the cache write (1.25×) and read
 * (0.1×) and billed neither. Pinned in `apps/gateway .../anthropicUpstream.test.ts`.
 */
export function meterCachedUsage(usage: TokenUsage): { tokensIn: number; tokensOut: number } {
  const read = usage.cachedInputTokens ?? 0;
  const written = usage.cacheWriteInputTokens ?? 0;
  const fullPrice = Math.max(0, usage.inputTokens - read - written);
  return {
    tokensIn: Math.round(fullPrice + read * CACHE_READ_MULTIPLIER + written * CACHE_WRITE_MULTIPLIER),
    tokensOut: usage.outputTokens,
  };
}
