/**
 * Unified REDACTION-category catalog — the single source of "which categories exist and
 * how they're presented", shared by every surface that governs them. The KEY vocabulary
 * is `@openmasq/redact`'s `RedactionCategory`, re-exported so there is ONE key type.
 */
import {
  CATEGORY_HUE,
  CATEGORY_SECTION,
  REDACTION_SECTIONS,
  SECTION_HUE,
  type Hue,
  type RedactionCategory,
  type RedactionSection,
} from "@openmasq/redact";

export type { RedactionCategory };
// The palette's single source, re-exported so a consumer never declares a second one.
export { CATEGORY_HUE, CATEGORY_SECTION, SECTION_HUE };
export type { Hue, RedactionSection };

// The `var(--hl-<hue>)` custom property behind a hue — the form every UI surface consumes.
const hlFg = (h: Hue): string => `var(--hl-${h})`;

/** Ordered display sections for the rules modal / admin policy grid. */
export const REDACTION_CATEGORY_GROUPS: string[] = [...REDACTION_SECTIONS];

/** One toggleable redaction category with its display metadata. */
export interface CatalogRedactionCategory {
  key: RedactionCategory;
  label: string;
  /** Its display section — from `CATEGORY_SECTION`, the palette's own grouping. */
  group: RedactionSection;
  /** Highlight colour as a `var(--hl-*)` CSS custom property. DERIVED from the category's
   *  section (`SECTION_HUE`), so a row on the rules screen is the colour the chat paints. */
  tone: string;
  /** True = only detected by the model engine (free-form PII) — UI nudges to enable. */
  ai?: boolean;
  /** User-facing FR summary of what the category ACTUALLY covers — surfaced in the
   *  rules modal and the docs so a short label never under-sells (or over-sells) the
   *  engine. Trust obligation (root rule 8): keep it accurate when rules change. */
  detail?: string;
  /** What redacting this category can DISTORT in the reply — the other half of
   *  the trust obligation (rule 8): overselling reliability would be the
   *  same bug as overselling protection. Shown where it's checked (rules
   *  matrix). Figures and reasoning: `packages/redact/bench/RAPPORT-risques-
   *  utilite-2026-07.md` — a DERIVATION is not a vault key. */
  impact?: string;
}

import { BASE } from "./categories.data";

/**
 * Per-SECTION swatch colour as a `var(--hl-*)` property, DERIVED from `SECTION_HUE`: the
 * colour the rules chips wear AND the colour a mark of that section wears in the chat, a
 * document and the privacy report. Deriving makes a disagreement unrepresentable — never
 * re-declare a colour here.
 */
export const REDACTION_GROUP_TONE: Record<string, string> = Object.fromEntries(
  REDACTION_SECTIONS.map((section) => [section, hlFg(SECTION_HUE[section])]),
);

/**
 * Categories the ENGINE still knows but the PRODUCT no longer exposes: absent from
 * `REDACTION_CATEGORIES` (no toggle, no policy row) and forced OFF in `CATEGORY_DEFAULTS`.
 * Unlike an off-by-default category, a retired one cannot be switched back on:
 * `effectiveRedactCategories` (`packages/ui/src/send/redactionOptions.ts`) forces them off
 * at the send merge, so a persisted `true` or an old policy row cannot resurrect one.
 */
export const RETIRED_CATEGORIES: readonly RedactionCategory[] = ["health", "number", "salary"];

/** The full catalogue of toggleable redaction categories. Section AND colour are read from
 *  the palette source, never declared beside the label. */
export const REDACTION_CATEGORIES: CatalogRedactionCategory[] = BASE.map((c) => ({
  ...c,
  group: CATEGORY_SECTION[c.key],
  tone: hlFg(CATEGORY_HUE[c.key]),
}));

/**
 * Default on/off policy per category, DERIVED from `BASE`:
 *  - `ai` (BETA) categories default ON: identity data the product's copy promises to
 *    protect, and the default engine is the offline NER, so the promise holds out of the
 *    box. ⚠️ Where the AI engine is unavailable the send FAILS CLOSED — never "fix" that by
 *    flipping these off silently.
 *  - `apikey` is ON: the one heuristic whose MISS is a credential in clear, so it belongs
 *    to the floor every level shares (`ALWAYS_ON`, `packages/ui/src/privacy/privacyLevel.ts`).
 *  - `username` is ON from Renforcé (`FROM_RENFORCE` in `levels.ts`): a handle
 *    re-identifies its owner; not at Standard, where a leading `@` is mostly code.
 *  - `url` stays OFF (opt-in); every deterministic PII category stays ON.
 *  - `path` is OFF: the engine fakes a path SEGMENT BY SEGMENT, which breaks a coding
 *    agent's commands, while the USERNAME a path identifies is covered by `name`. Strict
 *    turns it on; a value already persisted as on stays on.
 *  - a RETIRED category is absent from `BASE`, hence OFF with no way back on.
 * Keyed over the ENGINE's enum so the record stays total.
 */
const OFF_BY_DEFAULT = new Set<RedactionCategory>(["url", "date", "path"]);
export const CATEGORY_DEFAULTS: Record<RedactionCategory, boolean> = Object.fromEntries(
  (Object.keys(CATEGORY_HUE) as RedactionCategory[]).map((key) => {
    const c = BASE.find((b) => b.key === key);
    return [key, !!c && !OFF_BY_DEFAULT.has(key)];
  }),
) as Record<RedactionCategory, boolean>;

// The three protection levels as category sets — shared by the desktop settings and the local proxy.
export {
  ALWAYS_ON,
  categoriesForLevel,
  FROM_RENFORCE,
  disabledKindsOf,
  type RedactionLevel,
  usesLocalModel,
} from "./levels";

// The per-connector masking policy — one home for its SHAPE and for how a connector's
// effective masking resolves, because the desktop's panes and the proxy's console both
// edit it (`maskingPolicy.ts` says what each surface keeps for itself).
export {
  effectiveMasking,
  loosensMasking,
  maskedCategories,
  MASKING_KEYS,
  overriddenConnectors,
  overridesMasking,
  type ConnectorMasking,
  type MaskingPolicy,
} from "./maskingPolicy";
