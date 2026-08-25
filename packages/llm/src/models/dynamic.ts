import type { ModelInfo, ProviderId } from "../types.js";
import { MODELS } from "./registry.js";
import { MODEL_PRICING } from "./pricing.js";
import { MODEL_CONTEXT } from "./limits.js";

/**
 * A model discovered at RUNTIME from a provider's own catalogue (today only
 * OpenRouter, whose public `/api/v1/models` endpoint is self-describing — id,
 * pricing, context window, modalities). The desktop fetches it in main and hands
 * the normalized list here; `setDynamicModels` folds it into the LIVE registry.
 */
export interface DynamicModel {
  /** The wire id (namespaced `vendor/model`, `:free` for the no-cost tiers). */
  id: string;
  label: string;
  provider: ProviderId;
  vision?: boolean;
  /** Context window in tokens, when the catalogue reports it. */
  contextTokens?: number;
  /** USD per 1M tokens. `{in:0,out:0}` marks a free tier. */
  pricing?: { in: number; out: number };
  /** Tool/function-calling support per the catalogue's `supported_parameters`:
   *  `false` = declared UNSUPPORTED (a `tools` request 400s — Gemma tiers), `true` =
   *  declared supported, absent = the catalogue didn't say (assumed capable). */
  tools?: boolean;
}

/**
 * REPLACE a provider's registered models with a freshly-fetched list, mutating the
 * LIVE registry structures (`MODELS` + `MODEL_PRICING` + `MODEL_CONTEXT`) IN PLACE so
 * every existing synchronous reader — `findModel`, the pickers' `ALL_MODELS`,
 * `MODEL_PRICING[id]`, `contextWindow` — sees the update with no call-site change.
 *
 * WHY replace, not merge: a provider like OpenRouter renames/retires slugs constantly
 * (a `:free` tier is gated the moment its sponsor pulls it), so the live catalogue is
 * the source of truth — a stale hard-coded id must DISAPPEAR, not linger and 404. It
 * drops this provider's current entries (the static baseline OR a prior fetch) then adds
 * the fresh set.
 *
 * Called ONLY after a SUCCESSFUL, non-empty fetch (the caller guards on that), so a
 * failed/absent fetch leaves the static baseline untouched — the offline fallback. It
 * NEVER touches another provider's models. Returns the count applied.
 *
 * Not React-aware: it mutates module state, so the caller must trigger a re-render
 * (a store/hook state bump) for mounted pickers to re-read the arrays.
 */
export function setDynamicModels(provider: ProviderId, list: readonly DynamicModel[]): number {
  for (let i = MODELS.length - 1; i >= 0; i--) {
    if (MODELS[i].provider === provider) MODELS.splice(i, 1);
  }
  for (const m of list) {
    const info: ModelInfo = { id: m.id, label: m.label, provider: m.provider };
    if (m.vision) info.vision = true;
    if (m.tools === false) info.noTools = true;
    MODELS.push(info);
    if (m.pricing) MODEL_PRICING[m.id] = { in: m.pricing.in, out: m.pricing.out };
    if (typeof m.contextTokens === "number" && m.contextTokens > 0) {
      MODEL_CONTEXT[m.id] = m.contextTokens;
    }
  }
  version += 1;
  for (const cb of listeners) cb();
  return list.length;
}

// ─── Change signal ──────────────────────────────────────────────────────────────
// The in-place mutation above is invisible to a React memo whose deps can't name it:
// `store.unavailableModels` iterated the merged MODELS but never recomputed, so the
// live-fetched OpenRouter models carried NO availability reason while the static
// baseline's did — the "some say Clé requise, some don't" incoherence. Subscribe +
// read the version (fits `useSyncExternalStore`) to recompute on every merge.
let version = 0;
const listeners = new Set<() => void>();

/** Monotonic registry version — bumps on every `setDynamicModels` merge. */
export function modelsVersion(): number {
  return version;
}

/** Subscribe to registry merges; returns the unsubscribe. */
export function onModelsChanged(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
