import type { ProviderId } from "../types.js";
import { MODEL_PRICING } from "./pricing.js";
import { findModel, PLATFORM_OPENROUTER_IDS } from "./registry.js";

/** PLATFORM-PROVIDED providers: no user API key REQUIRED — a keyless send is proxied by
 *  the platform (its key) and metered on the prepaid credit budget. EXACTLY TWO:
 *  - **Scaleway** — subscription ONLY (no `keyUrl`: a user cannot bring their own).
 *  - **OpenRouter** — the ONLY dual one: own key ⇒ DIRECT; no key ⇒ the platform serves
 *    the CURATED ids (`PLATFORM_OPENROUTER_IDS`), so a discovered slug stays BYO-only.
 *  Everything else is BYO-PERSONAL-KEY ONLY (a keyless send is refused « Clé requise »).
 *  The server keeps its own copy of this allow-list; `platformModels.test.ts` pins ours. */
export function isPlatformProvider(provider: ProviderId): boolean {
  return provider === "scaleway" || provider === "openrouter";
}

/** Platform-eligible AND actually SERVABLE for THIS model id. Differs from
 *  `isPlatformProvider` for OpenRouter only, whose catalogue is DISCOVERED at runtime. The
 *  routing decision (`resolveEffectivePlatform`) and the picker's greying key off this one
 *  predicate (rule 9).
 *  ⚠️ For OpenRouter the rule is **"known AND priced"**, a MONEY invariant: metering reads
 *  `MODEL_PRICING`, and an id with no price meters ZERO. `setDynamicModels` always writes a
 *  price, so this is the backstop for anything arriving another way. A `:free` tier's
 *  explicit `{in:0,out:0}` IS a price. With no catalogue merged the static baseline applies. */
export function isPlatformServableModel(provider: ProviderId, modelId: string): boolean {
  if (!isPlatformProvider(provider)) return false;
  if (provider !== "openrouter") return true;
  const known = findModel(modelId);
  if (known?.provider !== "openrouter") return PLATFORM_OPENROUTER_IDS.includes(modelId);
  return !!MODEL_PRICING[modelId];
}

/** True unless the model is marked `noTools` (no function calling — a `tools` request
 *  400s upstream, e.g. OpenRouter's Gemma tiers). Unknown ids are assumed capable. */
export function supportsTools(modelId: string): boolean {
  return findModel(modelId)?.noTools !== true;
}

/** A FREE model — priced explicitly at 0 in/out (the OpenRouter `:free` tiers). NEVER
 *  blocked by the credit budget, usable by ANY account. An UNPRICED model is NOT free. */
export function isFreeModel(id: string): boolean {
  const p = MODEL_PRICING[id];
  return !!p && p.in === 0 && p.out === 0;
}

/**
 * FREE MODE — what an account with no key AND no subscription can run on the platform's
 * key. A NAMED list, not "anything that costs 0": a `:free` tier still consumes the shared
 * key's QUOTA, so price stays the BILLING rule (`isFreeModel`), not the ACCESS rule.
 * ⚠️ The only list (rule 9): the picker, the send gate and the server all re-read it — a
 * renderer is not a trust boundary (rule 7). An id absent here simply falls back to
 * subscription or personal key.
 */
export const FREE_MODE_MODEL_IDS: readonly string[] = [
  "poolside/laguna-s-2.1:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
];

/** Is this model served WITHOUT a subscription or key? (`FREE_MODE_MODEL_IDS`) */
export function isFreeModeModel(id: string): boolean {
  return FREE_MODE_MODEL_IDS.includes(id);
}

/** OpenAI REASONING models (GPT-5.x, the o-series) reject a custom `temperature`; the
 *  OpenAI-compatible request paths omit it for these ids. Other ids on that path don't
 *  start with `gpt-5`/`o<digit>`. */
export function omitsTemperature(modelId: string): boolean {
  return /^(gpt-5|o\d)/i.test(modelId);
}

/** Claude models that accept **adaptive thinking**: the 4.6 family on. Haiku 4.5 and the
 *  3.x family 400 on `adaptive` and simply stream no reflection. */
export function supportsAdaptiveThinking(modelId: string): boolean {
  return modelId.startsWith("claude-") && !/^claude-(haiku|3)/.test(modelId);
}

/** Gemini models that can return **thought summaries**: the 2.5 family and later. Older
 *  ones error on the field, hence the gate. */
export function supportsGeminiThoughts(modelId: string): boolean {
  return /^gemini-(2\.5|[3-9])/.test(modelId);
}
