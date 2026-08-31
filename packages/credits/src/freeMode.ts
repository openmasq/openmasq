/**
 * FREE MODE for a deployment — `OPENMASQ_FREE_MODE=1`.
 *
 * When on, nobody pays and nothing is sold: credits are UNLIMITED (`credits.ts`
 * no longer blocks, the gateway no longer pre-refuses), the till is closed on the backend
 * side (`isBillingEnabled()` ⇒ false, so 503 `BILLING_DISABLED` on anything that involves
 * money) and the app replaces the pricing grid with "everything's included". It's the mode
 * for a SELF-HOSTED deployment that has no Stripe and wants no cap.
 *
 * ## A DERIVED fact, never a setting
 *
 * Nothing is written to the database: no subscription row, no account type. Removing the
 * variable restores exactly the prior state — every account gets back its real tier
 * (included, granted or paid) and its budget. That's what distinguishes it from tester mode
 * (`app_settings`, persisted grants): that one is reclaimed account by account, free
 * mode switches off on a redeploy.
 *
 * ## One home, TWO services
 *
 * This predicate lives here because `@openmasq/credits` is imported by the backend AND the
 * gateway — the only place where the same read serves both. ⚠️ Each reads ITS OWN
 * environment: the variable must be set on both deployments, otherwise the app shows
 * "everything included" while the gateway answers 402 (`SELF_HOSTING.md`).
 *
 * ## What it does NOT do
 *
 * - It doesn't cancel any existing Stripe subscription: Stripe keeps charging what it
 *   was charging. Free mode is designed for a target WITHOUT a Stripe key; on a target
 *   that has one, the operator cancels it themselves in Stripe.
 * - It doesn't touch personal-key models or local models — they never
 *   depended on credits.
 *
 * ⚠️ Read on EVERY call, never frozen at load time: on a serverless function the module
 * survives the deployment that sets (or removes) the variable. Same rule as
 * `billingEnabled.ts` on the backend side. Only the value `"1"` turns it on — a `"true"`, a
 * `"yes"` or a space reads as off, fail-closed on the direction that opens access.
 */
export const FREE_MODE_ENV = "OPENMASQ_FREE_MODE";

export function isFreeMode(env: Record<string, string | undefined> = process.env): boolean {
  return env[FREE_MODE_ENV] === "1";
}
