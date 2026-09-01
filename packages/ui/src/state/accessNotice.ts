import type { BillingSubscription, CreditBalance, OrgProfileInfo } from "../host";

/**
 * "You have no access" — the decision, pure.
 *
 * Two paths lead to the full catalogue: a **subscription** (models go through
 * subscription credits) or **your own key** with a provider. With neither, the
 * picker shrinks to the free models — and the user only finds out by seeing a
 * short list, or by hitting a free model's daily quota.
 *
 * ⚠️ What the banner does NOT say: "you can't send anything". That's false — the
 * free models work with nothing set up. It announces what's MISSING, not a block.
 */
export interface AccessNoticeInput {
  /** The providers with a key registered on this machine. */
  keyConfigured: ReadonlySet<string>;
  /** The individual subscription. `null` = not loaded yet. */
  personalSub: BillingSubscription | null;
  /** The individual prepaid balance. `null` = not loaded yet. */
  personalCredits: CreditBalance | null;
  /** Org member ⇒ their access is managed by an admin. */
  orgProfile: OrgProfileInfo | null;
  /** Does the platform expose a billing surface? Otherwise nothing to offer. */
  hasBilling: boolean;
}

export function needsAccessNotice(p: AccessNoticeInput): boolean {
  // An org member doesn't choose: telling them to get a subscription would send
  // them to a page that doesn't concern them.
  if (p.orgProfile) return false;
  // Nothing to sell on this platform (web preview) ⇒ no banner.
  if (!p.hasBilling) return false;
  // A single key, any one, is enough to open a path.
  if (p.keyConfigured.size > 0) return false;
  // ⚠️ `null` = NOT LOADED YET, and does not mean "no subscription": at startup
  // billing arrives after the first render, and announcing a gap before knowing
  // would flash the banner at someone who's paying.
  if (!p.personalSub) return false;
  if ((p.personalSub.tier ?? "free") !== "free") return false;
  // A remaining credit (gifted, promo) is access: it will run out, and it's the
  // send block that will say so then — not a permanent banner above the composer.
  if (p.personalCredits && !p.personalCredits.blocked) return false;
  return true;
}
