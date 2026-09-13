/**
 * Unified REDACTION-category catalog — the single source of truth for "which
 * redaction categories exist and how they're presented", shared by the desktop UI
 * and the org admin console.
 *
 * The category KEY vocabulary is `@openmasq/redact`'s `RedactionCategory` (the
 * engine's own enum) — re-exported here so there is ONE key type. The display
 * metadata (labels, groups, tones, defaults) previously lived in the UI-only file
 * `packages/ui/src/components/Settings/shared.ts`; it moves here so the admin can
 * govern the same categories the desktop enforces, with no drift.
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
// Re-export the palette's single source so a consumer (the desktop UI, the org admin
// console) colours a section or a category from it rather than declaring a second,
// drifting palette. `CATEGORY_HUE` is itself derived from `SECTION_HUE`.
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
 * Per-SECTION swatch colour as a `var(--hl-*)` property — **DERIVED** from `SECTION_HUE`,
 * the palette's single source. This is the colour the "Règles de redaction" chips wear AND
 * the colour a redaction mark of that section wears in the chat, in a document and in the
 * privacy report: one value, one variable, no possible disagreement.
 *
 * It used to be a palette of its OWN, nine section-only colours declared here beside a
 * six-hue marker palette declared in the engine — which is how the rules screen came to
 * promise "e-mail is blue" while the chat painted it lime. Deriving is what makes that
 * class of bug unrepresentable; do not re-declare a colour here.
 */
export const REDACTION_GROUP_TONE: Record<string, string> = Object.fromEntries(
  REDACTION_SECTIONS.map((section) => [section, hlFg(SECTION_HUE[section])]),
);

/**
 * Categories the ENGINE still knows but the PRODUCT no longer exposes. They are absent
 * from `REDACTION_CATEGORIES` (no Settings toggle, no admin-policy row, not a valid
 * `forced_categories` id at the backend) and forced OFF in `CATEGORY_DEFAULTS`.
 *
 * A retired category is NOT the same as one that merely defaults off: an off-by-default
 * category can be switched back on, this one cannot. `effectiveRedactCategories`
 * (`packages/ui/src/send/redactionOptions.ts`) therefore forces them off at the send
 * merge — a `health: true` persisted before the retirement, or an org policy row written
 * against the old catalog, must not resurrect a category with no UI to turn it back off.
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
 *  - **`ai` (BETA) categories default ON** — name/dob/address/location/company are the
 *    identity data the product's own copy promises to protect, and the default engine is
 *    the offline NER (`DEFAULT_SETTINGS.redactEngine: "local"`, bundled on the packaged
 *    desktop), so the promise holds out of the box. The "BETA" badge and the per-category
 *    toggles remain; a user who prefers no model-based redaction turns them off and their
 *    persisted choice wins over this seed (`normalizeSettings` spreads user settings over
 *    it). ⚠️ Where the AI engine is unavailable the send FAILS CLOSED by design — never
 *    "fix" that by flipping these back off silently.
 *  - **`apikey` (generic key-shaped strings) is now ON** — it is the one heuristic whose
 *    MISS is a credential in clear, so it belongs to the floor every level shares
 *    (`ALWAYS_ON`, `packages/ui/src/privacy/privacyLevel.ts`) rather than to the noise
 *    tier. The trade is accepted knowingly: the heuristic is broad and also catches
 *    harmless product references, which is exactly why it used to default OFF.
 *  - `username` is ON from Renforcé (`FROM_RENFORCE` in `levels.ts`, where the arithmetic
 *    lives): a handle re-identifies its owner across services, so leaving it in clear IS a
 *    data risk — unlike a URL, whose masking mostly breaks a link the model needed to read.
 *    Not at Standard, though: its only signal is a leading `@`, which on source code is a
 *    scope, a flag argument or a bot mention far more often than a person.
 *  - `url` stays OFF — deliberately opt-in, and its absence is not a data risk the way a
 *    name, a handle or a key is.
 *  - every deterministic PII category (email/phone/card/iban/national_id/ip/secret)
 *    stays ON.
 *  - `path` is OFF by default, and that is a REVERSAL. It was on, and it cost more than it
 *    protected: the engine fakes a path SEGMENT BY SEGMENT, so `apps`, `proxy`, `server.ts`
 *    each became a vault entry, and a coding agent got back commands it could not run —
 *    `echo` masked to `JVeoNe`, "command not found". What a path actually identifies is the
 *    USERNAME in it, which `name` still covers; the rest is machine layout, which the model
 *    needs to work and which says nothing about a person. Strict still turns it on, because
 *    hiding the layout is exactly what Strict is for; anyone who wants it back has one
 *    switch in Réglages ▸ Confidentialité, and a value already persisted as on stays on.
 *  - a RETIRED category is absent from `BASE`, hence OFF with no way back on.
 *
 * Keyed over the ENGINE's enum, not `BASE`, so the record stays total: consumers index it
 * by `RedactionCategory` and spread it as the seed for `Settings.redactCategories`.
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
