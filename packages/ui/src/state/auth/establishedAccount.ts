import type { BillingSubscription, OrgProfileInfo } from "../../host";

/**
 * "This account is already set up somewhere" — the decision, pure.
 *
 * `Settings.onboarded` is LOCAL to the machine (localStorage scoped per account +
 * local DB, never synced): a subscriber signing in on a NEW device therefore fell
 * back to the full onboarding, "Subscription, or your key" step included — offering
 * to pay to someone who's already paying. This rule says when the account is clearly
 * ESTABLISHED: onboarding then has nothing left to teach or sell them, and
 * `ShellChrome` sets `onboarded` without routing them back through the modal.
 *
 * ⚠️ `null` = NOT LOADED YET, and means neither "free" nor "established" (same rule
 * as `needsAccessNotice`): at startup billing arrives after the first render, and
 * deciding before knowing would skip onboarding for a genuine newcomer — or inflict
 * it on a subscriber. As long as we don't know, we don't skip.
 *
 * We do NOT touch `billingMode` when skipping: without a key on this machine,
 * routing already falls back to the subscription (`send/routing.ts` — the "byo"
 * default is only a choice once a key exists), and pre-answering on its behalf is
 * exactly what `KeyChoice` refuses to do.
 */
export function hasEstablishedAccount(p: {
  /** The individual subscription. `null` = not loaded yet. */
  personalSub: BillingSubscription | null;
  /** Org member ⇒ their access already exists, managed by an admin. */
  orgProfile: OrgProfileInfo | null;
}): boolean {
  if (p.orgProfile) return true;
  return !!p.personalSub && (p.personalSub.tier ?? "free") !== "free";
}
