import { categoriesForLevel, REDACTION_CATEGORIES } from "@openmasq/catalog";
import type { Conversation, RedactCategoryKey, Settings } from "../../types";

/**
 * The pure half of the pre-search REVEAL gate (`store.sendMessage`'s `confirmWebNav`):
 * what may be offered, and what a returned pick is allowed to reveal. Kept out of the
 * card and out of `store.ts` so both sides are testable without a render.
 */

// The categories a web-navigation tool can offer to STOP redacting for the conversation:
// exactly what « Standard » leaves readable and « Renforcé » masks — the model-detected
// "BETA" set (names, dates of birth, addresses, places, companies) plus the handle rule,
// whose substance IS what a web search is about. Order = the catalogue's display order.
// ⚠️ DERIVED from the level arithmetic, never recopied (rule 9): the card offers a LEVEL
// ("switch to Standard for this message") instead of enumerating types, and the two
// phrasings can only stay one set if this list is computed from `categoriesForLevel` — the
// same function the settings cards read. Recopied by hand (it once mirrored the `ai` flag),
// it drifted the day a non-model category joined Renforcé. Pinned by `webNavReveal.test.ts`.
const STANDARD = categoriesForLevel("standard");
const RENFORCE = categoriesForLevel("renforce");
export const WEBNAV_OFFER_KEYS: RedactCategoryKey[] = REDACTION_CATEGORIES.filter(
  (c) => RENFORCE[c.key] && !STANDARD[c.key],
).map((c) => c.key as RedactCategoryKey);

/**
 * The subset of `WEBNAV_OFFER_KEYS` currently REDACTED in this conversation and NOT
 * org-forced (a forced category can't be disabled, so it's never offered). Uses the
 * SAME global ⊕ per-conversation override merge as the send pipeline. Empty when none
 * of the five are active → no card is offered.
 */
export function webNavOfferableCategories(
  conv: Conversation,
  settings: Settings,
  orgForced: readonly string[],
): RedactCategoryKey[] {
  const effective: Record<string, boolean> = {
    ...(settings.redactCategories ?? {}),
    ...(conv.redactCategories ?? {}),
  };
  return WEBNAV_OFFER_KEYS.filter((k) => effective[k] === true && !orgForced.includes(k));
}

/**
 * What the user's pick is ALLOWED to reveal. The card hands back the categories it
 * struck through, but the renderer is untrusted for security decisions (root rule 7):
 * a key that is not on offer — never proposed, already revealed, or **org-forced** —
 * can never be revealed by posting it back. Nullish/absent ⇒ reveal NOTHING, which is
 * also the fail-closed value a Stop / dangling gate resolves with.
 */
export function webNavRevealSet(
  picked: readonly RedactCategoryKey[] | null | undefined,
  offerable: readonly RedactCategoryKey[],
): RedactCategoryKey[] {
  if (!picked?.length) return [];
  // Dedupe as well as filter — a repeated key would push a duplicate into `disabledKinds`.
  return offerable.filter((k) => picked.includes(k));
}
