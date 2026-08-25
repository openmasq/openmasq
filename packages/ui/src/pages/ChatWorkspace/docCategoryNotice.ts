import {
  CATEGORY_DEFAULTS,
  REDACTION_CATEGORIES,
  RETIRED_CATEGORIES,
} from "@openmasq/catalog/redaction";
import { effectiveRedactCategories } from "../../send/redactionOptions";

/**
 * The category labels a document preview must DISCLAIM: OFF right now while the
 * SHIPPED DEFAULT has them ON — i.e. this conversation's protection is weaker than
 * the product's own policy (the user or an override turned something off).
 *
 * Exists because absence is invisible in a document. In the chat the user watches a
 * name NOT get highlighted as they type; in a 50-page file the same non-detection is
 * silent, while the tab label ("Redacted") and the counter ("4 à redact") read as
 * exhaustive — so a user closes the preview reassured and ships the names in clear.
 *
 * Scoped to deviations FROM the default on purpose: the noise-tier heuristics
 * (`url`/`username`) are OFF by design on every install, and disclosing them on every
 * document would cry wolf — the banner must only appear when something is genuinely
 * weaker than what the product promises. A fresh install shows nothing. ⚠️ `apikey` left
 * that tier: it defaults ON and belongs to every level's floor, so turning it off IS a
 * deviation and IS disclosed.
 *
 * Same precedence as the send (`effectiveRedactCategories`: global ⊕ conversation ⊕
 * org-forced), seeded with `CATEGORY_DEFAULTS`. Retired categories are excluded:
 * "désactivé" would suggest they can be turned on.
 */
export function inactiveCategoryLabels(
  settingsCats: Record<string, boolean> | undefined,
  convCats: Record<string, boolean> | undefined,
  orgForcedCategories: string[] | undefined,
): string[] {
  const eff = {
    ...CATEGORY_DEFAULTS,
    ...effectiveRedactCategories(settingsCats, convCats, orgForcedCategories),
  };
  const off = REDACTION_CATEGORIES.filter(
    (c) =>
      !(RETIRED_CATEGORIES as readonly string[]).includes(c.key) &&
      eff[c.key] === false &&
      CATEGORY_DEFAULTS[c.key] === true,
  );
  // AI categories first: the display caps the list, and names/addresses/companies are
  // the ones whose absence actually hurts in a document.
  return [...off.filter((c) => c.ai), ...off.filter((c) => !c.ai)].map((c) => c.label);
}
