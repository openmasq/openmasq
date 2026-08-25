import { REDACTION_CATEGORIES } from "@openmasq/catalog";
import type { Conversation, RedactCategoryKey, Settings } from "../types";

/**
 * The pure half of the pre-search REVEAL gate (`store.sendMessage`'s `confirmWebNav`):
 * what may be offered, and what a returned pick is allowed to reveal. Kept out of the
 * card and out of `store.ts` so both sides are testable without a render.
 */

// The categories a web-navigation tool can offer to STOP redacting for the
// conversation (name/dob/address/location/company — the model-detected "BETA" set
// whose place/org/person names ARE public web content's substance). Order = display order.
// ⚠️ DÉRIVÉ du catalogue, jamais recopié (règle 9). Le drapeau `ai` est ce qui affiche
// le badge « BETA » dans les réglages ET dans la modale de règles ; c'est donc la même
// liste qui décrit la catégorie à l'utilisateur et qui décide de ce qu'une recherche peut
// relâcher. Recopiée à la main, elle dérivait en silence : ajouter une catégorie BETA
// demain la ferait apparaître badgée sans être relâchable — ou l'inverse, ce qui est pire.
export const WEBNAV_OFFER_KEYS: RedactCategoryKey[] = REDACTION_CATEGORIES.filter(
  (c) => c.ai,
).map((c) => c.key as RedactCategoryKey);

/**
 * ⚠️ Cette liste EST ce que le niveau « Standard » laisse lisible — pas par coïncidence
 * mais par construction : `privacy/privacyLevel.ts` dérive ses `BETA_KEYS` du MÊME drapeau
 * `ai` du même catalogue. C'est ce qui autorise la carte à proposer un NIVEAU (« passer en
 * Standard pour ce message ») au lieu d'énumérer cinq types : les deux phrases décrivent
 * le même ensemble, et aucune ne peut dériver de l'autre. Épinglé par
 * `webNavReveal.test.ts` — un commentaire ne peut pas échouer en CI (règle 9).
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
