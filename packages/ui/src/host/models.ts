import type { DynamicModel } from "@openmasq/llm";

/**
 * Optional model-catalogue reader (desktop only). Fetches a provider's OWN live model
 * list so the picker isn't pinned to a hard-coded set that drifts (OpenRouter renames /
 * gates slugs constantly).
 *
 * DEGRADE, never fail: absent slot, a throw, or an empty result ⇒ the static registry
 * baseline stays (see `hooks/useOpenRouterModels.ts`). The fetch runs in MAIN over the
 * hardened `safeFetch` egress path against a FIXED first-party URL (no renderer input →
 * no SSRF); the renderer only ever receives normalized DATA, never code.
 *
 * Scoped to OpenRouter today — the only provider whose public endpoint is self-describing
 * (id + pricing + context + modalities) with NO key. Extend with a `listFor(provider)` if
 * the key-gated providers' `/v1/models` (ids only) are ever wired in.
 */
export interface ModelsHost {
  /** OpenRouter's live catalogue, normalized. Rejects/([]) ⇒ keep the static baseline. */
  listOpenRouter(): Promise<DynamicModel[]>;
}
