/**
 * The thresholds that decide how aggressively the tool set is reduced before it
 * reaches the model — split out of `toolRouter.ts`/`toolCatalog.ts` into their own
 * (tiny) file so a caller can override them WITHOUT growing either file past its
 * cap. Production call sites never pass a config — they always get these DEFAULTS,
 * so changing them here changes real behaviour, not just the eval bench.
 *
 * PROMOTED 2026-07-30 (`evals/strategies.ts` "rich-desc" → new defaults): a real-model
 * bench (`pnpm bench --strategies current,lean,rich-desc`, 3 paid models, N=24 runs/cell)
 * found the tighter routing threshold + richer per-tool descriptions beat the OLD
 * defaults on `inclusionai/ling-2.6-flash` in `all` mode (full 102-tool fleet) on every
 * axis at once — conformance 24/24 vs 20/24, 1st-call p50 -9%, tokens ↑ -6 to -7% — with
 * no regression on the other two models tested. The OLD numbers are kept as the `legacy`
 * strategy in `strategies.ts` for future comparison. See `evals-reports/_bench/` for the
 * full data; this is ONE bench's worth of evidence, not exhaustive across model families.
 */

export interface RoutingConfig {
  /** `needsRouting`: send the whole tool set only under this fraction of the window. */
  routeRatio: number;
  /** `needsRouting`: … AND at or under this many tools. */
  routeMaxTools: number;
  /** `routeTools`'s own compact probe catalog: per-tool description truncation length
   *  (`- name [server] — desc`), independent of the model-facing `CatalogConfig.descMaxChars`. */
  routeDescMaxChars: number;
}

export interface CatalogConfig {
  /** `toolCatalog`: char budget for the names+description awareness catalog. */
  catalogMaxChars: number;
  /** `fitToBudget`: fraction of the window the deterministic fallback fits into. */
  fitBudgetRatio: number;
  /** `fitToBudget`: hard CEILING on how many tool schemas the deterministic fallback
   *  keeps, independent of `fitBudgetRatio`. Measured 2026-07-30 (real journal, a
   *  router failure cascading on a huge-context model): a ratio alone is not enough —
   *  283 full schemas comfortably FIT under a 1M-token window's budget, so the "fallback"
   *  pruned NOTHING (283/283 kept, 372k tokens for a task needing ONE tool). Fitting is
   *  not the same as being good — see `routeMaxTools`'s own rationale, same argument. */
  fitMaxTools: number;
  /** Whether the awareness catalog is injected at all when the tool set is pruned.
   *  `true` in production, ALWAYS — root rule ("pruning must not blind the model").
   *  `false` exists only so the eval bench can isolate the catalog's OWN latency/
   *  token cost (`evals/strategies.ts` "no-awareness"); never set outside a bench run. */
  enabled: boolean;
  /** Per-tool description truncation length in the catalog line (`- name — desc`).
   *  Literature on tool retrieval (semantic collisions between similarly-named tools)
   *  suggests description QUALITY/distinctiveness — not just raw budget — drives
   *  selection accuracy; this lets the eval bench test a richer per-tool description
   *  against the same total `catalogMaxChars` budget. */
  descMaxChars: number;
}

export const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  routeRatio: 0.15,
  routeMaxTools: 10,
  routeDescMaxChars: 260,
};

export const DEFAULT_CATALOG_CONFIG: CatalogConfig = {
  catalogMaxChars: 3000 * 4,
  fitBudgetRatio: 0.4,
  fitMaxTools: 40,
  enabled: true,
  descMaxChars: 220,
};
