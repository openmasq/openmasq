import type { ProviderId } from "../types.js";
import { MODEL_PRICING } from "./pricing.js";
import { findModel, PLATFORM_OPENROUTER_IDS } from "./registry.js";

/** PLATFORM-PROVIDED providers: no user API key REQUIRED — a keyless send is proxied
 *  by the platform's gateway (the platform's key) and metered on the prepaid credit budget. The
 *  send pipeline skips the missing-key check for these and gates them on credits.
 *
 *  EXACTLY TWO, and the split is the product's commercial shape:
 *  - **Scaleway** — subscription ONLY (the platform's key, no `keyUrl`: a user cannot bring
 *    their own).
 *  - **OpenRouter** — the ONLY dual one: own key ⇒ DIRECT; no key ⇒ the gateway serves
 *    the CURATED ids on the platform's key (`PLATFORM_OPENROUTER_IDS` / the gateway's
 *    `PLATFORM_MODELS`), so a dynamically-discovered slug stays BYO-only (fail-closed).
 *
 *  Everything else is BYO-PERSONAL-KEY ONLY: OpenAI / Anthropic / Google / Mistral /
 *  DeepSeek are NOT served on the platform's keys (a keyless send is refused « Clé requise »,
 *  never billed to the subscription), and `openai-compat` is the user's own machine.
 *  ⚠️ This set has a SECOND home the type system cannot bind: the gateway's
 *  `PLATFORM_MODELS` allow-list (`apps/gateway/.../chat/scaleway.ts`). Widening one
 *  without the other either 400s a legitimate send or serves inference nobody pays
 *  for — change them in the same commit (`platformModels.test.ts`). */
export function isPlatformProvider(provider: ProviderId): boolean {
  return provider === "scaleway" || provider === "openrouter";
}

/** Platform-eligible AND actually SERVABLE by the gateway for THIS model id. Differs
 *  from `isPlatformProvider` for ONE case: OpenRouter, the aggregator, whose catalogue
 *  is DISCOVERED at runtime rather than compiled in. The routing decision
 *  (`resolveEffectivePlatform`), the picker's greying AND the gateway's own allow-list
 *  all key off this one predicate, so a greyed row, a refused send and a 400 can't
 *  disagree (rule 9).
 *
 * ⚠️ For OpenRouter the rule is **"known AND priced"**, and the pricing half is a
 * MONEY invariant, not a nicety: the gateway meters with `deriveCreditCents`, which
 * reads `MODEL_PRICING` — an id we have no price for meters ZERO, i.e. inference on
 * the platform's key that no credit ever pays for. So an id absent from the registry, or
 * present with no price row, is NOT servable. Both sides merge the same catalogue
 * (`normalizeOpenRouterModels` → `setDynamicModels`, which always writes a price), so
 * "in the catalogue" and "priced" coincide by construction; the check is the backstop
 * for anything that arrives another way. A `:free` tier carries an explicit
 * `{in:0,out:0}` — that IS a price (and `isFreeModel` then waives the credit gate).
 *
 * With no catalogue merged (offline, or a failed fetch) the registry still holds the
 * curated static baseline, so this degrades to exactly the old behaviour. */
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

/** A FREE model — priced explicitly at 0 in/out (the OpenRouter `:free` tiers).
 *  It costs the platform nothing upstream, so it is NEVER blocked by the prepaid credit
 *  budget: usable by ANY account, even without a subscription. Both the client send
 *  gate and the gateway credit pre-check skip the block for these. An UNPRICED model
 *  (undefined) is NOT free (we don't assume) — only an explicit `{in:0,out:0}`. */
export function isFreeModel(id: string): boolean {
  const p = MODEL_PRICING[id];
  return !!p && p.in === 0 && p.out === 0;
}

/**
 * Le MODE GRATUIT — ce qu'un compte sans clé ET sans abonnement peut faire tourner sur la
 * clé de la plateforme. DEUX modèles, nommés (décision produit du 18/08).
 *
 * ⚠️ « Gratuit » ne veut pas dire « sans coût pour nous ». Un `:free` d'OpenRouter ne se
 * facture pas au jeton, mais il consomme le QUOTA de notre clé, partagé par tout le monde :
 * ouvrir les ~20 tiers gratuits du catalogue à qui ne paie rien, c'est laisser une poignée
 * de comptes assécher la file de tous. D'où une liste NOMMÉE plutôt que « tout ce qui coûte
 * 0 » — le prix reste la règle de facturation (`isFreeModel`), il n'est plus la règle
 * d'ACCÈS.
 *
 * ⚠️ Cette liste est la seule (règle 9) : le sélecteur y grise/masque, la garde d'envoi la
 * relit, et la PASSERELLE la relit encore — sans quoi la restriction ne serait que
 * cosmétique, un renderer n'étant pas une frontière de confiance (règle 7).
 *
 * Un id absent d'ici n'est pas interdit : il redevient simplement affaire d'abonnement ou
 * de clé personnelle, comme n'importe quel modèle payant.
 */
export const FREE_MODE_MODEL_IDS: readonly string[] = [
  "poolside/laguna-s-2.1:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
];

/** Ce modèle est-il servi SANS abonnement ni clé ? (`FREE_MODE_MODEL_IDS`) */
export function isFreeModeModel(id: string): boolean {
  return FREE_MODE_MODEL_IDS.includes(id);
}

/**
 * OpenAI REASONING models (the GPT-5.x family, the legacy o-series) reject a
 * custom `temperature` — only the API default is allowed, so sending one 400s.
 * The OpenAI-compatible request path (`providers/openai.ts`, `tools/openai.ts`)
 * omits `temperature` for these ids. Non-OpenAI ids that share that path
 * (Mistral, Scaleway/platform, local Ollama) don't start with `gpt-5`/`o<digit>`,
 * so they keep the temperature and are unaffected.
 */
export function omitsTemperature(modelId: string): boolean {
  return /^(gpt-5|o\d)/i.test(modelId);
}

/**
 * Claude models that accept **adaptive thinking** (`thinking: {type:"adaptive"}`) —
 * the only shape that streams a reflection back. Everything from the 4.6 family on
 * takes it; **Haiku 4.5 and the 3.x family predate it** and 400 on `adaptive` (they
 * would need the deprecated fixed `budget_tokens`, which eats the answer's own
 * `max_tokens` — not worth it on the cheap/fast tier), so they are excluded and
 * simply stream no reflection.
 */
export function supportsAdaptiveThinking(modelId: string): boolean {
  return modelId.startsWith("claude-") && !/^claude-(haiku|3)/.test(modelId);
}

/**
 * Gemini models that can return **thought summaries** (`thinkingConfig.includeThoughts`):
 * the 2.5 family and everything after it. `gemini-2.0-*` and older have no thinking
 * stage at all — sending the field to them is an error, not a no-op, hence the gate.
 */
export function supportsGeminiThoughts(modelId: string): boolean {
  return /^gemini-(2\.5|[3-9])/.test(modelId);
}
