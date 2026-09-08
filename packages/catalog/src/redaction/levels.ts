// The three protection levels as CATEGORY SETS — the one home (rule 9) for what « standard »,
// « renforcé » and « strict » switch on, read by the desktop's settings AND by the local proxy.
// Copy, hues and the "custom" state stay on the UI side; this is only the arithmetic.
import type { RedactionCategory } from "@openmasq/redact";
import { CATEGORY_DEFAULTS, REDACTION_CATEGORIES } from "./index";

export type RedactionLevel = "standard" | "renforce" | "strict";

/** The floor every level shares: a credential in clear is never an acceptable miss. */
export const ALWAYS_ON: readonly RedactionCategory[] = ["apikey", "secret"];

// Read at CALL time, not at module load: `./index` re-exports this file, so the list is
// still undefined while the two modules evaluate each other.
const aiKeys = () => new Set(REDACTION_CATEGORIES.filter((c) => c.ai).map((c) => c.key));
const allKeys = () => REDACTION_CATEGORIES.map((c) => c.key);

/**
 * Which categories a level turns on. `standard` = the rule-based defaults (free-form
 * identity data left readable), `renforce` = the defaults including the on-device model's
 * categories, `strict` = everything. The floor is applied LAST: no level turns it off.
 */
export function categoriesForLevel(level: RedactionLevel): Record<RedactionCategory, boolean> {
  const out = {} as Record<RedactionCategory, boolean>;
  const ai = aiKeys();
  for (const key of allKeys()) {
    const on =
      level === "strict"
        ? true
        : level === "standard"
          ? CATEGORY_DEFAULTS[key] !== false && !ai.has(key)
          : CATEGORY_DEFAULTS[key] !== false;
    out[key] = on || ALWAYS_ON.includes(key);
  }
  return out;
}

/**
 * Does this set need the on-device model? The `ai` categories (names, dates of birth,
 * addresses, places, companies) are the only ones it finds; a set without them is pure
 * pattern matching, so a caller can skip loading the model entirely.
 */
export function usesLocalModel(effectiveCategories: Record<string, boolean>): boolean {
  const ai = aiKeys();
  return Object.entries(effectiveCategories).some(
    ([key, on]) => on && ai.has(key as RedactionCategory),
  );
}

/** The categories turned OFF (left in clear / neither redacted nor highlighted). */
export function disabledKindsOf(effectiveCategories: Record<string, boolean>): string[] {
  return Object.entries(effectiveCategories)
    .filter(([, on]) => !on)
    .map(([kind]) => kind);
}
