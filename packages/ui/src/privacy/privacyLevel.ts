import { NOTORIOUS_COMMERCIAL_ORGS, NOTORIOUS_PEOPLE } from "@openmasq/redact";
import { CATEGORY_DEFAULTS, REDACT_CATEGORIES } from "./redactCategories";
import type { RedactCategoryKey, Settings } from "../types";
import { BRAND } from "@openmasq/branding";
import type { Messages, PrivacyLevelCopy } from "@openmasq/i18n";

/**
 * The redaction rules, as ONE choice instead of seventeen.
 *
 * The settings screen used to open on the full category matrix — nine collapsible groups,
 * « 14/17 actives ». That number answers a question nobody asks: what a user decides is
 * how much they want protected, not which of seventeen detectors runs. So the page offers
 * three levels and keeps the matrix for the one who genuinely wants it.
 *
 * `custom` is not a preset — it is what we CALL any set that is neither of the other two,
 * so a user who has hand-tuned their categories never sees their choices silently renamed
 * (nor reset) by opening this screen.
 */
export type PrivacyLevel = "standard" | "renforce" | "strict" | "custom";

/**
 * The levels, in INCREASING order of protection — that is what makes the list read as a
 * scale, and it is the only thing in this block that is not copy: a language does not
 * reorder a scale. The four registers come from the catalogue (`privacyLevels`), where
 * they are written in French and English.
 */
export function privacyLevelMeta(t: Messages): {
  id: Exclude<PrivacyLevel, "custom">;
  label: string;
  desc: string;
  reduced?: true;
  short: string;
  tradeoff: string;
}[] {
  const resolve = (id: Exclude<PrivacyLevel, "custom">, copy: PrivacyLevelCopy) => ({
    id,
    label: copy.label,
    desc: copy.desc,
    short: copy.short(BRAND.name),
    tradeoff: copy.tradeoff,
  });
  return [
    // ⚠️ `reduced` is a FACT about what the level protects, not a label: it removes the
    // shield from the selector and forbids this level from being the install default
    // (see the block below). It therefore stays in code, outside the catalogue.
    { ...resolve("standard", t.privacyLevels.standard), reduced: true as const },
    resolve("renforce", t.privacyLevels.renforce),
    resolve("strict", t.privacyLevels.strict),
  ];
}

/**
 * ⚠️ "Standard" PROTECTS LESS THAN THE DEFAULTS — and it is the only level in that case.
 *
 * It is the deliberate return of the old "Navigation" preset: it leaves the five BETA
 * categories in clear (names, dates of birth, addresses, places, companies), the ones
 * only the model detects. This preset had been removed because the engine already covers
 * web search without lowering its guard (the notoriety filter never masks a public figure,
 * a major brand, or a country, and `WebNavRedactOffer` offers to reveal the rest right
 * before the call that would trigger it). It comes back conditionally, and the conditions
 * are the trade-off, not decoration:
 *
 *  1. it carries `reduced: true` and does NOT carry the shield — a shield next to it would
 *     assert the protection it removes (rule 8: a UI that oversells masking is a trust
 *     bug). ⚠️ The "reduced protection" label that used to go with it has been removed:
 *     what states what it leaves readable now is the MATRIX, expanded by default under
 *     the cards (`Settings/privacy/PrivacyTab.tsx`). If it stopped being expanded, the
 *     label would need to come back — otherwise nothing signals it anymore;
 *  2. it is NOT the install default. `CATEGORY_DEFAULTS` is "Renforcé", so nobody lands
 *     there without having chosen it;
 *  3. it respects {@link ALWAYS_ON}, the floor that ALL levels share.
 *
 * Adding another reduced level requires all three, explicitly.
 */

/**
 * The FLOOR: the categories no level turns off, reduced level included.
 *
 * `apikey` is here because its absence is of a different nature than a name's: a
 * string shaped like a key that is let through IS a key in clear. The heuristic is
 * broad and also catches harmless product references — that is the price, and it is
 * paid knowingly. The user keeps control category by category (their choice becomes
 * « Sur mesure », like any other); what this floor guarantees is that no PRESET turns
 * it off behind their back.
 */
export const ALWAYS_ON: readonly RedactCategoryKey[] = ["apikey", "secret"];

/** The BETA categories — detected by the model alone. This is EXACTLY what the
 *  "Standard" level lets through. Derived from the catalogue (`ai`), never copied: a
 *  new BETA category joins the list the day it exists. */
const BETA_KEYS: RedactCategoryKey[] = REDACT_CATEGORIES.filter((c) => c.ai).map(
  (c) => c.key as RedactCategoryKey,
);

/** Every category key the UI can toggle. */
const ALL_KEYS = REDACT_CATEGORIES.map((c) => c.key as RedactCategoryKey);

/** The category map a level stands for. `custom` has none — it IS the absence of one. */
export function categoriesForLevel(level: Exclude<PrivacyLevel, "custom">): Settings["redactCategories"] {
  const out: Record<string, boolean> = {};
  for (const key of ALL_KEYS) {
    const on =
      level === "strict"
        ? true
        : level === "standard"
          ? CATEGORY_DEFAULTS[key] !== false && !BETA_KEYS.includes(key)
          : CATEGORY_DEFAULTS[key] !== false;
    // The floor is applied LAST: no level can turn it off, not even the reduced one.
    out[key] = on || ALWAYS_ON.includes(key);
  }
  return out as Settings["redactCategories"];
}

/**
 * Which level a saved category map amounts to. Compares the EFFECTIVE state (a missing
 * key means "default"), so a blob written before a category existed still reads as
 * Standard instead of jumping to « Sur mesure » on upgrade.
 *
 * Org-forced categories are excluded from the comparison: they are ON whatever the user
 * picked, so counting them would show « Sur mesure » to a member who never touched
 * anything — the screen would blame them for their admin's policy.
 */
export function levelOf(
  categories: Settings["redactCategories"] | undefined,
  forcedCategories?: readonly string[],
): PrivacyLevel {
  const forced = new Set(forcedCategories ?? []);
  const keys = ALL_KEYS.filter((k) => !forced.has(k));
  const on = (k: RedactCategoryKey) => (categories?.[k] ?? CATEGORY_DEFAULTS[k]) !== false;
  // Compared against the maps that `categoriesForLevel` ACTUALLY produces, not a second
  // definition of each level: the round-trip is then true by construction, and the
  // floor does not have to be repeated here. From most protective to least, so that a
  // level containing another does not mask it.
  for (const id of ["strict", "renforce", "standard"] as const) {
    const map = categoriesForLevel(id);
    if (keys.every((k) => on(k) === (map[k] !== false))) return id;
  }
  return "custom";
}

/** How many categories are actually protecting, org-forced ones included. */
/**
 * THE NOTORIETY LIST: public figures and major companies —
 * the app's MCP integrations included, absolutely (product request from 30/07/2026;
 * parity with the connector catalogue is pinned by
 * `notorietyCatalogParity.test.ts`) — that every level EXCEPT Strict never redacted.
 * It lives in `@openmasq/redact` (`model/notoriousData.ts` — a single home,
 * rule 9) and is re-exported here so the settings screens can SHOW it
 * without copying it.
 */
export { NOTORIOUS_COMMERCIAL_ORGS, NOTORIOUS_PEOPLE };

/** What the level grants to the notoriety exemption — the engine's two flags. */
export interface NotorietyPolicy {
  /** `commercialNotoriety`: major brands + MCP integrations exempted. */
  commercial: boolean;
  /** `peopleNotoriety`: public figures exempted. */
  people: boolean;
}

/**
 * The level's notoriety exemption — the store passes it on every engine call.
 *
 * **Strict redacted everything**: brands, MCP integrations AND public figures ("the
 * model reasons over fictional values" applies to them too). **Every other level**
 * (Standard, Renforcé, Sur mesure) exempts both: a major brand or "Albert
 * Einstein" are general knowledge here — to redact them makes the model answer
 * about a made-up company or about nobody. What the exemption never covers,
 * whatever the level: the "I work at Google" gate in the engine wins (the entity
 * is public, the user's RELATION to it is not), and per-category scoping too (a
 * private individual named Hermès/Leclerc stays protected). Countries remain
 * exempted even under Strict (a redacted country makes geography drift).
 */
export function notorietyForLevel(level: PrivacyLevel): NotorietyPolicy {
  const strict = level === "strict";
  return { commercial: !strict, people: !strict };
}

/**
 * How many bars the level glyph carries: protection, drawn as a quantity
 * (`components/brand` `LevelsIcon`). Standard 1, Renforcé 2, Strict 3.
 *
 * ⚠️ « Sur mesure » cannot claim ANY tier — it is precisely the set that is none of
 * them. Giving it three bars would oversell the protection (rule 8: a UI that
 * oversells masking is a trust bug); giving it one would undersell it just as
 * much. So it is deduced from what is REALLY active, by thirds — the only answer
 * that promises nothing it does not hold.
 */
export function levelBars(
  level: PrivacyLevel,
  categories?: Settings["redactCategories"],
  forcedCategories?: readonly string[],
): 1 | 2 | 3 {
  if (level === "standard") return 1;
  if (level === "renforce") return 2;
  if (level === "strict") return 3;
  const ratio = activeCount(categories, forcedCategories) / (TOTAL_CATEGORIES || 1);
  return ratio >= 2 / 3 ? 3 : ratio >= 1 / 3 ? 2 : 1;
}

export function activeCount(
  categories: Settings["redactCategories"] | undefined,
  forcedCategories?: readonly string[],
): number {
  const forced = new Set(forcedCategories ?? []);
  return ALL_KEYS.filter((k) => forced.has(k) || (categories?.[k] ?? CATEGORY_DEFAULTS[k]) !== false).length;
}

export const TOTAL_CATEGORIES = ALL_KEYS.length;

/** The level's display name: the preset's label, or « Sur mesure » for the set that is none
 *  of them — the ONE place a surface asks for it (tooltip, ⋯ menu, confirmation pill). */
export function privacyLevelLabel(t: Messages, level: PrivacyLevel): string {
  return privacyLevelMeta(t).find((m) => m.id === level)?.label ?? t.leaves.privacyLevels.custom;
}
