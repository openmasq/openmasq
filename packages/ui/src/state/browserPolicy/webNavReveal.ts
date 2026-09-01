import { REDACTION_CATEGORIES } from "@openmasq/catalog";
import type { Conversation, RedactCategoryKey, Settings } from "../../types";

/**
 * The pure half of the pre-search REVEAL gate (`store.sendMessage`'s `confirmWebNav`):
 * what may be offered, and what a returned pick is allowed to reveal. Kept out of the
 * card and out of `store.ts` so both sides are testable without a render.
 */

// The categories a web-navigation tool can offer to STOP redacting for the
// conversation (name/dob/address/location/company — the model-detected "BETA" set
// whose place/org/person names ARE public web content's substance). Order = display order.
// ⚠️ DERIVED from the catalog, never recopied (rule 9). The `ai` flag is what displays
// the "BETA" badge in settings AND in the rules modal; it's therefore the same
// list that describes the category to the user and decides what a search may
// release. Recopied by hand, it drifted silently: adding a BETA category
// tomorrow would make it appear badged without being releasable — or the reverse, which is worse.
export const WEBNAV_OFFER_KEYS: RedactCategoryKey[] = REDACTION_CATEGORIES.filter(
  (c) => c.ai,
).map((c) => c.key as RedactCategoryKey);

/**
 * ⚠️ This list IS what the « Standard » level leaves readable — not by coincidence
 * but by construction: `privacy/privacyLevel.ts` derives its `BETA_KEYS` from the SAME
 * `ai` flag of the same catalog. That's what lets the card offer a LEVEL ("switch to
 * Standard for this message") instead of enumerating five types: the two phrasings describe
 * the same set, and neither can drift from the other. Pinned by
 * `webNavReveal.test.ts` — a comment can't fail in CI (rule 9).
 */

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
