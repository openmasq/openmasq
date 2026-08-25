import { isPlatformProvider, isPlatformServableModel } from "@openmasq/llm";

/**
 * The send's ROUTING decision (pure, security-relevant, unit-tested): does this send
 * go through the app's metered gateway/credits on a platform-provided key, or direct
 * on the user's OWN provider key?
 *
 * A platform provider (Scaleway/OpenRouter) is proxied through the gateway — with the
 * user's Supabase JWT, no provider key — UNLESS the user configured that provider's
 * OWN key. The billing-mode switch (Settings → Compte) can FORCE the gateway
 * ("subscription") even when a key exists. This is the SINGLE source of that decision:
 * it feeds the pre-flight credit gate AND the platform-token block, so both agree on
 * whether a Supabase token (not a provider key) is what leaves.
 *
 * MODEL-aware, not just provider-aware: OpenRouter is platform-eligible only for the
 * curated static ids the gateway allow-lists — a dynamically-discovered slug routed to
 * the gateway 400s MODEL_NOT_ALLOWED, so it stays BYO (`isPlatformServableModel`).
 */
export function resolveEffectivePlatform(
  provider: Parameters<typeof isPlatformProvider>[0],
  modelId: string,
  billingMode: string | undefined,
  keyConfigured: ReadonlySet<string>,
): boolean {
  return (
    isPlatformServableModel(provider, modelId) &&
    (billingMode === "subscription" || !keyConfigured.has(provider))
  );
}

/**
 * The `apiKey` + `baseUrl` a `host.complete` call needs to route the SAME way a send does —
 * so an out-of-band completion (the memory extractor) reaches the model instead of silently
 * failing. A PLATFORM model → the gateway (the Supabase `token` as the bearer, `inferenceUrl`
 * as the base, no provider key); a local `openai-compat` model → its configured endpoint; a
 * direct BYO model → neither (main injects the stored key from the encrypted store).
 *
 * Throws when a platform route is REQUIRED but the gateway URL or token is missing — fail
 * closed, so the caller can leave its watermark and retry once the session is ready. This is
 * the exact routing an OpenRouter `:free` (the default keyless model) needs; without it the
 * extractor's `host.complete` had no endpoint and no key, so « retiens que… » never persisted.
 */
export function completeRouting(
  provider: Parameters<typeof isPlatformProvider>[0],
  modelId: string,
  opts: {
    billingMode: string | undefined;
    keyConfigured: ReadonlySet<string>;
    inferenceUrl: string | undefined;
    token: string | undefined;
    openaiCompatBaseUrl?: string;
  },
): { apiKey?: string; baseUrl?: string } {
  if (resolveEffectivePlatform(provider, modelId, opts.billingMode, opts.keyConfigured)) {
    if (!opts.inferenceUrl || !opts.token) throw new Error("platform routing unavailable");
    return { apiKey: opts.token, baseUrl: opts.inferenceUrl };
  }
  if (provider === "openai-compat") return { baseUrl: opts.openaiCompatBaseUrl };
  return {};
}
