// Named prompt-size STRATEGIES for the bench's strategy axis (`OPENMASQ_EVAL_STRATEGY`,
// `scripts/tooling/bench-agentic.ts --strategies`). Each is a `{ routing, catalog }` pair in the
// exact shape `McpAgentParams.routingConfig` expects — swept against the REAL scenario
// catalog (real tool schemas, real models) to compare latency vs. conformance. `current`
// reproduces today's production defaults EXACTLY; it exists so a diff against it always
// has a same-code baseline in the same run.
//
// PROMOTED 2026-07-30: `rich-desc`'s numbers became `DEFAULT_ROUTING_CONFIG`/
// `DEFAULT_CATALOG_CONFIG` (see `routingConfig.ts` for why) — `current` and `rich-desc`
// are now the SAME strategy, kept as two names on purpose (one reads as "the shipped
// default", the other as "the description-quality hypothesis" that earned it). The
// pre-promotion numbers live on as `legacy`, so a future bench can still ask "did we
// regress vs. the OLD defaults", not just vs. the other experimental presets.

import { DEFAULT_ROUTING_CONFIG, DEFAULT_CATALOG_CONFIG, type RoutingConfig, type CatalogConfig } from "../agent/routingConfig";

export interface Strategy {
  routing: RoutingConfig;
  catalog: CatalogConfig;
}

/** The thresholds shipped before the 2026-07-30 promotion (routeRatio 0.35/routeMaxTools 24/
 *  descMaxChars 140+120/catalogMaxChars 28000/fitBudgetRatio 0.6, and NO count cap on the
 *  `fitToBudget` fallback — `fitMaxTools: Infinity` faithfully reproduces that absence)
 *  — never reapplied by default, kept only so `--strategies legacy,current` can measure
 *  the delta on demand. */
const LEGACY_ROUTING: RoutingConfig = { routeRatio: 0.35, routeMaxTools: 24, routeDescMaxChars: 140 };
const LEGACY_CATALOG: CatalogConfig = { catalogMaxChars: 7000 * 4, fitBudgetRatio: 0.6, fitMaxTools: Infinity, enabled: true, descMaxChars: 120 };

export const STRATEGIES: Record<string, Strategy> = {
  // Today's shipped thresholds — the baseline every other strategy is measured against.
  current: { routing: DEFAULT_ROUTING_CONFIG, catalog: DEFAULT_CATALOG_CONFIG },
  // The pre-2026-07-30 defaults, kept nameable for a future regression check.
  legacy: { routing: LEGACY_ROUTING, catalog: LEGACY_CATALOG },
  // Routes/prunes much sooner and offers a smaller awareness catalog than `legacy` did —
  // the "aggressive prompt-size reduction" hypothesis this whole bench exists to measure.
  lean: {
    routing: { routeRatio: 0.15, routeMaxTools: 10, routeDescMaxChars: 140 },
    catalog: { catalogMaxChars: 3000 * 4, fitBudgetRatio: 0.4, fitMaxTools: 15, enabled: true, descMaxChars: 120 },
  },
  // Rarely routes/prunes — close to "always offer full schemas" (fitMaxTools uncapped,
  // matching that intent). A ceiling: if `lean` doesn't beat `current` on latency, it
  // certainly won't beat this on conformance.
  verbose: {
    routing: { routeRatio: 0.9, routeMaxTools: 100, routeDescMaxChars: 140 },
    catalog: { catalogMaxChars: 20000 * 4, fitBudgetRatio: 0.9, fitMaxTools: Infinity, enabled: true, descMaxChars: 120 },
  },
  // Same routing as `current`, but the awareness catalog is OFF when pruned — isolates
  // the catalog's own latency/token cost from the routing pre-pass's.
  "no-awareness": {
    routing: DEFAULT_ROUTING_CONFIG,
    catalog: { ...DEFAULT_CATALOG_CONFIG, enabled: false },
  },
  // Same tight budget as `lean`, but RICHER per-tool descriptions instead of terser
  // ones — the tool-retrieval literature's finding that description QUALITY/
  // distinctiveness (not just raw token budget) drives selection accuracy. This is
  // what won the 2026-07-30 promotion, so it's now literally `current` — kept as its
  // own name for readability in a report ("rich-desc beat legacy" reads better than
  // "current beat legacy" once `current` itself has moved).
  "rich-desc": { routing: DEFAULT_ROUTING_CONFIG, catalog: DEFAULT_CATALOG_CONFIG },
};

/** Resolve a strategy by name, throwing on an unknown one — a silently-ignored typo in
 *  `OPENMASQ_EVAL_STRATEGY` would otherwise run `current` and look like a null result. */
export function resolveStrategy(name: string): Strategy {
  const s = STRATEGIES[name];
  if (!s) throw new Error(`stratégie inconnue « ${name} » — choix : ${Object.keys(STRATEGIES).join(", ")}`);
  return s;
}
