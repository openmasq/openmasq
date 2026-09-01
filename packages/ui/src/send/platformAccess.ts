import type { Messages } from "@openmasq/i18n";
/**
 * **Does this build have a hosted service?** — that is, an inference gateway AND
 * accounts, the two halves without which an "included" model has neither endpoint nor
 * token. This is a BUILD constant (the app cannot gain one along the way), on the same
 * footing as `BRAND`: hence one single home rather than a flag passed down
 * into every component that talks about a subscription (and `sold`, below, for the subscription itself).
 *
 * Without it, a build with no backend (the default open-source case; the services live in the private `infra` repository)
 * still offered the platform's models and said "get a subscription":
 * two false statements. With it, those same models go back to being what they
 * truly are on this machine — KEY models, for which the user's own key is the
 * only door (`resolveEffectivePlatform`).
 *
 * ⚠️ The default is `true` (the historical behaviour): a host that doesn't call
 * `configurePlatformAccess` — the web preview, a test harness — behaves as
 * before. Getting this wrong in this direction costs an inaccurate sentence and an explicit
 * send error, never an open boundary: the gateway checks the token on its own side,
 * and nothing here decides what goes OUT.
 */
let served = true;

/**
 * **Does this build SELL subscriptions?** — the second build constant, and its default
 * is the inverse of the first: `false`. Nothing sells until the build says so
 * (`OPENMASQ_BILLING=1`, `apps/desktop/scripts/buildDefines.ts`). Off, EVERYTHING that
 * talks about a subscription disappears — the Billing tab (the host doesn't wire up `billing`), the
 * "Subscription required" badges, the "Get a subscription" cards, sync's paywall,
 * the "Subscription, or your key" step — and the "included models" path
 * is named by what it then is: *your account*. An included model stays included; only
 * the word that sells it goes away.
 *
 * ⚠️ Two constants, not one: "served" (there are included models) and "sold" (they're
 * charged for) stay distinct — a self-hosted stack entered into the app serves without
 * selling, and a server on `OPENMASQ_FREE_MODE=1` serves without charging. On desktop,
 * `OPENMASQ_BILLING=1` is also the gate that lets the API and the gateway into the
 * build: without it, nothing remote except auth, Slack, analytics and updates.
 * The `false` default is the product's own, not a degraded mode: saying "subscription"
 * to someone who can buy nothing is the false sentence.
 */
let sold = false;

/** Called ONCE by the host, at startup, from what the build received. `sold`
 *  omitted ⇒ nothing to sell. */
export function configurePlatformAccess(opts: { served: boolean; sold?: boolean }): void {
  served = opts.served;
  sold = opts.sold === true;
}

/** Are the platform's served models reachable in this build? */
export function platformAccessServed(): boolean {
  return served;
}

/** Does this build sell subscriptions? `false` by default — see `sold` above. */
export function subscriptionsSold(): boolean {
  return sold;
}

/** How a sentence names the "included models" path: "dans l'abonnement X" when
 *  it sells, "avec votre compte X" otherwise. ONE home, because the same aside
 *  recurs under the badge, in the send refusal and on the group label. */
export function includedWith(brand: string, t: Messages): string {
  return sold ? t.availability.includedInSubscription(brand) : t.availability.includedWithAccount(brand);
}
