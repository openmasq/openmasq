import type { RedactionCategory } from "./types";

/**
 * The categories whose COVERAGE depends on a model detector (`detectLocal` or `complete`).
 * Free-form identity data — a name, a company, a place — has no shape a rule can match: the
 * rules only catch the anchored cases (a labelled field, « né le … », a postal code), the
 * model finds the rest. A fact of the ENGINE, not a product choice: which of these a caller
 * turns ON is its own policy (the app's levels live in `@openmasq/catalog`).
 *
 * Fail closed with {@link requiresModel}: a caller that enables one of these and has no
 * detector must refuse the pass, not send a text half-masked by the rules alone.
 */
export const MODEL_CATEGORIES: readonly RedactionCategory[] = ["name", "dob", "address", "location", "company"];

/**
 * Does a pass with these `disabledKinds` (the engine option, same meaning) leave ON a
 * category only a model covers? No list = every category on (a bare call) ⇒ `true`.
 */
export function requiresModel(disabledKinds?: readonly string[]): boolean {
  if (!disabledKinds) return true;
  const off = new Set(disabledKinds);
  return MODEL_CATEGORIES.some((c) => !off.has(c));
}
