import { BRAND } from "@openmasq/branding";
import { DEFAULT_LOCALE, type Locale, type Messages, type PlanTierCopy } from "@openmasq/i18n";
import { subscriptionsSold } from "../send/platformAccess";
// Canonical plan-tier catalog (Free / Solo / Team) — the single vocabulary the desktop
// + extension read. The backend catalog (GET /v1/billing/prices) is the pricing
// source of truth; these amounts mirror it for display when a live fetch isn't wired.
// Per seat (org) or per person (individual). Amounts in eurocents. Credits = the
// prepaid monthly model-usage budget included.
//
// ⚠️ Solo and Team have the SAME price and the SAME allowance, deliberately: the card must
// therefore sell the FRAME (imposed rules, allowed models and connectors, one invoice),
// not the volume. A Team card promising « plus de crédits » would be false.
//
// ⚠️ `scale` has left the sold catalogue. The slug survives in `TierSlug` + `LABEL` so that
// an account still on Scale DISPLAYS correctly; it simply no longer has a card to buy.
// See `RETIRED_TIERS` on the backend side.

export type TierSlug = "free" | "solo" | "team" | "scale";

export interface PlanTier {
  tier: TierSlug;
  name: string;
  /** Monthly price per seat/person, in eurocents. */
  priceCents: number;
  /** Included prepaid model-usage budget, in eurocents. Free has none (`creditsCentsForAccountType("FREE") === 0`). */
  creditsCents: number;
  recommended?: boolean;
  /** A neutral badge next to the name (e.g. Free's "Dès l'inscription"). */
  tag?: string;
  /** What the tier includes — shown as a bullet list on the plan card. */
  feats: string[];
}

/** The grid of tiers in `t`'s language. Price, credits and "recommended" are FACTS of the
 *  offer and stay here; name, label and selling points come from the catalogue. */
export function planTiers(t: Messages): PlanTier[] {
  const b = BRAND.name;
  const copy = (c: PlanTierCopy) => ({ name: c.name, tag: c.tag, feats: c.feats.map((f) => f(b)) });
  return [
    { tier: "free", priceCents: 0, creditsCents: 0, ...copy(t.billing.tiers.free) },
    { tier: "solo", priceCents: 1200, creditsCents: 800, ...copy(t.billing.tiers.solo) },
    { tier: "team", priceCents: 1200, creditsCents: 800, recommended: true, ...copy(t.billing.tiers.team) },
  ];
}


/** Display label for a tier slug / legacy account type. */
export function tierLabel(tier: string | null | undefined, t: Messages): string {
  if (!tier) return t.billing.tierLabels.free;
  // `PRO` is the old server name of the Team tier; the other keys are slugs.
  const key = tier === "PRO" ? "team" : tier.toLowerCase();
  return (t.billing.tierLabels as Record<string, string | undefined>)[key] ?? tier;
}

/**
 * May a surface PITCH a personal subscription to this account?
 *
 * Only when we positively KNOW the account is on the free tier. An unknown subscription
 * (`null` — still loading, or the fetch failed) must NOT produce an upsell: telling a
 * paying customer to subscribe is worse than withholding a CTA they can still reach from
 * Réglages → Paiement. That is the same "known free tier" shape (and the same
 * no-flicker reason) as `send/modelAvailability.ts`, deliberately NOT the fail-to-free
 * reading in `send/preflight.ts` — there the upsell replaces a hard block, so erring
 * toward showing it costs the user nothing.
 *
 * An org member is never pitched either: seats are bought in the web console by an admin,
 * so the CTA would lead nowhere they can act.
 */
export function canPitchSubscription(p: {
  sub: { tier?: string } | null | undefined;
  /** The signed-in member's org authorization (any non-null value = in an org). */
  inOrg?: boolean;
}): boolean {
  // Nothing to sell in this build (`subscriptionsSold`, the default) ⇒ never a pitch, whatever
  // the tier: this is the one door every upsell surface re-reads.
  if (!subscriptionsSold()) return false;
  if (p.inOrg) return false;
  return !!p.sub && (p.sub.tier ?? "free") === "free";
}

/**
 * The account's tier as a surface may STATE it — `null` when it isn't known.
 *
 * `sub` is null in three different situations (never fetched yet, the platform has no
 * `billing` host, the fetch failed) and none of them is "the user is on the free tier".
 * Collapsing them with `sub?.tier ?? "free"` is what shows a paying account
 * « 0 € · Abonnement actuel ». Read the null as unknown and say nothing instead.
 */
export function knownTier(sub: { tier?: string } | null | undefined): string | null {
  if (!sub) return null;
  return sub.tier ?? "free";
}

/** What a click on a tier card must TRIGGER. */
export type TierAction = "self-grant" | "change-tier" | "checkout";

/**
 * Where a click on another tier goes. Pure and tested (`billing.test.ts`) because the only
 * branch that matters here is the one that got it wrong.
 *
 * ⚠️ "Subscribed" is NOT "tier ≠ free". A **grant** — the included Solo tier every account
 * receives on arrival, or an access given by an admin — displays a tier without any Stripe
 * subscription existing behind it. `change-tier` swaps the price of a Stripe subscription:
 * on a grant it has nothing to swap and answers `409 NO_SUBSCRIPTION`.
 * Confusing the two therefore sent EVERY account down the dead route — nobody was buying
 * any more, at any tier. A grant goes through CHECKOUT, like a free account.
 *
 * `canChangeTier` = can the host run the change in place (the web preview and mobile
 * cannot) — otherwise checkout, which exists everywhere.
 */
export function tierAction(p: {
  testerMode: boolean;
  isPaid: boolean;
  isGranted?: boolean;
  canChangeTier: boolean;
}): TierAction {
  if (p.testerMode) return "self-grant";
  if (p.isPaid && !p.isGranted && p.canChangeTier) return "change-tier";
  return "checkout";
}

/**
 * Map a backend billing failure (HTTP status + the response `code`) to the message
 * shown to the user. Lives HERE, not in a host, because every surface that drives
 * `/v1/billing/*` needs the same wording — desktop and mobile both import it, and
 * a second copy would drift on the day a new backend code appears (root rule 9).
 *
 * The getters may stay silent (they return null), but an ACTION — checkout, portal,
 * change-tier — that opens nothing MUST say why.
 */
/**
 * A payment action's failure as the HOST reports it: a status and a bounded code, never a
 * sentence. The sentence is chosen in the UI (`billingErrorMessage`), in the interface
 * language — a host that phrased it froze French into `apps/desktop`.
 */
export class BillingApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(code ? `billing ${status} ${code}` : `billing ${status}`);
    this.name = "BillingApiError";
  }
}

export function billingErrorMessage(status: number, t: Messages, code?: string): string {
  const e = t.billing.errors;
  switch (code) {
    case "BILLING_DISABLED":
      return e.disabled;
    case "TESTER_MODE_ENABLED":
      return e.testerMode;
    case "SUBSCRIPTION_ALREADY_ACTIVE":
      return e.alreadyActive;
    case "NO_STRIPE_CUSTOMER":
      return e.noCustomer;
    case "STRIPE_PRICE_NOT_CONFIGURED":
      return e.priceNotConfigured;
    case "STRIPE_API_ERROR":
      return e.stripe;
  }
  if (status === 401) return e.signIn;
  if (status === 404) return e.accountNotFound;
  if (status >= 500) return e.serverDown;
  return e.generic;
}

/** Formats euro cents as an EUR amount, in the GIVEN locale (« 1,00 € » in French,
 *  « €1.00 » in English). The currency stays the euro — the product is billed in euros —
 *  only the FORMAT follows the language, via `Intl` (not the catalogue: a number is not a
 *  sentence). Default = source language, for callers still outside React context. */
export function formatCents(cents: number, locale: Locale = DEFAULT_LOCALE): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: "eur" }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} €`;
  }
}
