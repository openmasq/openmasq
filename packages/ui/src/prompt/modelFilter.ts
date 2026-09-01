import { MODEL_PRICING, isFreeModel, type ModelInfo } from "@openmasq/llm";
import { canonicalVendorKey, vendorFromName, vendorPrefix } from "./vendorKey";

/**
 * The model pickers' search + vendor-family logic. Pure (unit-tested in
 * `modelFilter.test.ts`), shared by the Settings default-model grid AND the chat's
 * Finder-style `ModelSelector`. It exists for the OpenRouter group: the live catalogue
 * is ~320 models, a wall of cards without a way to narrow by vendor family or free text.
 *
 * Vendor identity (spelling folding + name recognition) is single-sourced in
 * `vendorKey.ts` (rule 9) — the logo resolver folds identically.
 */

/** Friendly labels keyed by the CANONICAL family key. Anything unlisted is
 *  title-cased from its slug, so a new vendor still gets a readable chip. */
const FAMILY_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  meta: "Meta",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  xai: "xAI",
  cohere: "Cohere",
  nvidia: "NVIDIA",
  microsoft: "Microsoft",
  perplexity: "Perplexity",
  amazon: "Amazon",
  bytedance: "ByteDance",
  ai21: "AI21",
  nous: "Nous",
  moonshot: "Moonshot",
  minimax: "MiniMax",
  "z-ai": "Z.AI",
  "aion-labs": "Aion Labs",
  inclusionai: "InclusionAI",
  "ibm-granite": "IBM Granite",
  "arcee-ai": "Arcee",
  inflection: "Inflection",
  liquid: "Liquid",
  "openai-compat": "Local",
  // Vendors whose slug does not title-case into their real name.
  openrouter: "OpenRouter",
  allenai: "Ai2",
  rekaai: "Reka",
  stepfun: "StepFun",
  thinkingmachines: "Thinking Machines",
  deepcogito: "Deep Cogito",
  inception: "Inception Labs",
  sakana: "Sakana AI",
  "nex-agi": "NEX AGI",
  kwaipilot: "Kwaipilot",
  cognitivecomputations: "Cognitive Computations",
  "anthracite-org": "Anthracite",
};

/** Native providers whose id carries no `vendor/` prefix → their vendor family,
 *  so a native OpenAI model and an `openai/*` OpenRouter model share one chip. */
const PROVIDER_FAMILY: Partial<Record<string, string>> = {
  openai: "openai",
  "openai-session": "openai",
  anthropic: "anthropic",
  "anthropic-session": "anthropic",
  "claude-cli": "anthropic",
  "codex-cli": "openai",
  "antigravity-cli": "google",
  google: "google",
  mistral: "mistral",
  deepseek: "deepseek",
};

export interface ModelFamily {
  /** Canonical vendor slug — the selection + match key. */
  key: string;
  /** Human label shown on the chip. */
  label: string;
}

export interface FamilyOption extends ModelFamily {
  count: number;
}

const titleCase = (s: string): string =>
  s
    .split(/[-_ ]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const labeled = (key: string): ModelFamily => ({
  key,
  label: FAMILY_LABELS[key] ?? titleCase(key),
});

/** The vendor family a model belongs to. A namespaced OpenRouter id names its own
 *  vendor in the `vendor/…` prefix (spellings folded: `mistralai`→`mistral`,
 *  `~anthropic`→`anthropic`). A Scaleway id carries NO prefix, so its vendor is read
 *  from the model NAME — and only then does the group split into GLM / Qwen / DeepSeek
 *  / Kimi / … Falls back to the provider's own house family when unrecognised. */
export function modelFamily(m: ModelInfo): ModelFamily {
  const prefix = vendorPrefix(m.id);
  if (prefix) return labeled(canonicalVendorKey(prefix));
  const named = vendorFromName(m.id);
  if (named) return labeled(named);
  return labeled(canonicalVendorKey(PROVIDER_FAMILY[m.provider] ?? m.provider));
}

/** Distinct families across the given models, most-populated first. `minCount`
 *  hides one-off vendors from the chip row — the long tail stays reachable by the
 *  free-text search. */
export function modelFamilies(models: ModelInfo[], minCount = 1): FamilyOption[] {
  const byKey = new Map<string, FamilyOption>();
  for (const m of models) {
    const fam = modelFamily(m);
    const cur = byKey.get(fam.key);
    if (cur) cur.count++;
    else byKey.set(fam.key, { ...fam, count: 1 });
  }
  return [...byKey.values()]
    .filter((f) => f.count >= minCount)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export interface FamilySubgroup extends ModelFamily {
  models: ModelInfo[];
}

/** Partition a PROVIDER group's models into vendor-family sub-groups, most-populated
 *  first (matching the chip row), model order preserved within a family. Used to add a
 *  sub-header under a provider whose group mixes vendors (OpenRouter/Scaleway);
 *  the caller flattens a single-family result (no redundant sub-header). */
export function subgroupByFamily(models: ModelInfo[]): FamilySubgroup[] {
  const byKey = new Map<string, FamilySubgroup>();
  for (const m of models) {
    const fam = modelFamily(m);
    const cur = byKey.get(fam.key);
    if (cur) cur.models.push(m);
    else byKey.set(fam.key, { ...fam, models: [m] });
  }
  return [...byKey.values()].sort(
    (a, b) => b.models.length - a.models.length || a.label.localeCompare(b.label),
  );
}

const fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Filter models by a free-text query (label / id / family label) AND an optional
 *  selected family key. Both are ANDed; an empty query + null family returns the
 *  input unchanged. The id is matched too, so a product-line query like "gpt" or
 *  "claude" hits `openai/gpt-…` / `anthropic/claude-…` even though the family chip
 *  is the vendor. */
export function filterModels(
  models: ModelInfo[],
  query: string,
  family: string | null,
  price: PriceTier | null = null,
): ModelInfo[] {
  const q = fold(query.trim());
  if (!q && !family && !price) return models;
  return models.filter((m) => {
    if (family && modelFamily(m).key !== family) return false;
    if (price && modelPriceTier(m.id) !== price) return false;
    if (!q) return true;
    return fold(`${m.label} ${m.id} ${modelFamily(m).label}`).includes(q);
  });
}

// ─── Price tiers ───────────────────────────────────────────────────────────────

/** Token-price buckets for the picker's price filter. Bucketed on the OUTPUT price
 *  (the axis that dominates a chat bill), thresholds in USD / 1M output tokens. */
export type PriceTier = "free" | "eco" | "standard" | "premium";

/** Chip vocabulary, cheapest first. `title` states the actual range so the short
 *  label never has to lie about where a boundary sits. */
export const PRICE_TIERS: { key: PriceTier; label: string; title: string }[] = [
  { key: "free", label: "Gratuit", title: "0 $ — n'entame jamais vos crédits" },
  { key: "eco", label: "Éco", title: "≤ 3 $ / M tokens en sortie" },
  { key: "standard", label: "Standard", title: "3 à 20 $ / M tokens en sortie" },
  { key: "premium", label: "Premium", title: "> 20 $ / M tokens en sortie" },
];

/** A model's price bucket, or null when its price is UNKNOWN (no registry entry) —
 *  an unknown price matches no tier rather than being guessed into one. */
export function modelPriceTier(id: string): PriceTier | null {
  if (isFreeModel(id)) return "free";
  const p = MODEL_PRICING[id];
  if (!p) return null;
  return p.out <= 3 ? "eco" : p.out <= 20 ? "standard" : "premium";
}
