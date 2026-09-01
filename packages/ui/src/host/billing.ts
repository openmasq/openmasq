/**
 * INDIVIDUAL (per-person) billing — the subscription snapshot, the prepaid credit
 * budget, and the capability that fetches them and drives Stripe.
 *
 * Its own home rather than a corner of `account.ts`: three deployment-wide switches
 * ride on the subscription (`billingEnabled`, `selfGrantEnabled`, `freeMode`), each
 * with its OWN reading of "unknown", and the comment that says which way each one
 * falls is the whole contract. Grouping them keeps that legible (rule 10).
 */

/** The signed-in user's INDIVIDUAL (per-person) subscription snapshot. */
export interface BillingSubscription {
  /** Canonical tier: "free" | "solo" | "team" | "scale". */
  tier: string;
  /** Stripe status ("active" | "trialing" | "canceled" | …), or "free" when none. */
  status: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string;
  /** A GRANT (included tier / access given) and not a sale — no Stripe subscription
   *  behind it, hence nothing `changeTier` could swap: the route is CHECKOUT
   *  (`state/billing.ts` `tierAction`). Absent ⇒ `false`, a subscriber's behaviour. */
  isGranted?: boolean;
  /**
   * Can the deployment TAKE PAYMENT? `false` = the offer still shows (same tiers, same
   * amounts) but subscribing and managing are closed server-side (503 `BILLING_DISABLED`).
   *
   * ⚠️ `undefined` does NOT mean "closed": it is a platform, or an older backend, that does
   * not say. Reading it as closed would grey out the buttons of a perfectly working
   * deployment — the unknown therefore leaves the action open, and the 503 decides, with
   * its message. Closing on a doubt is the WRONG direction here: nothing irreversible is
   * at stake, only a click that explains why.
   */
  billingEnabled?: boolean;
  /**
   * The deployment's TESTER MODE: any signed-in account can grant itself a tier without
   * paying. Global — everyone or no one, never per-person.
   *
   * ⚠️ Here the unknown reads as OFF, the opposite of `billingEnabled`, and the reason is
   * the same in both cases: never promise what cannot be delivered. Wrongly greying out
   * « S'abonner » closes an action that works; wrongly showing « S'octroyer » offers a
   * DEAD button, which the server will refuse.
   */
  selfGrantEnabled?: boolean;
  /**
   * The deployment's FREE MODE (`OPENMASQ_FREE_MODE`): nobody pays, credits are unlimited,
   * nothing is sold. The Payment tab replaces the grid with "everything is included"
   * (`FreeModeBilling`). The server then serves `tier: "unlimited"` — a tier that OPENS
   * access to the included models (`send/modelAvailability.ts` only blocks `"free"`)
   * without being a sold card. Absent ⇒ off: an older backend does not say so, and the
   * normal offer is the right fallback.
   */
  freeMode?: boolean;
}

/** A prepaid credit budget (eurocents). Shared by org + individual surfaces. */
export interface CreditBalance {
  blocked: boolean;
  allotmentCents: number;
  consumedCents: number;
  balanceCents: number;
  /** Free mode: no ceiling. `allotmentCents`/`balanceCents` are 0 and mean nothing — the
   *  gauge shows consumption alone, never « 0 € restants ». */
  unlimited?: boolean;
}

/**
 * Optional INDIVIDUAL (per-person) billing capability — present on platforms that
 * can reach the backend `/v1/billing/*` with a signed-in session (desktop, mobile;
 * the extension would route through its background). Org (per-seat) billing is
 * administered in the web console, not here. Checkout/portal open the returned Stripe
 * URL in the system browser.
 *
 * ⚠️ Absent does NOT mean "free" — but that is how it renders, because the UI has no
 * other source: no slot ⇒ `sub: null` ⇒ the free tier, so a paying account is shown
 * « 0 € · Abonnement actuel » with the actions disabled. Any surface that can reach the
 * backend must implement this rather than rely on the degradation.
 */
export interface BillingHost {
  /** The user's current personal subscription, or null on any failure / signed out. */
  getSubscription(): Promise<BillingSubscription | null>;
  /** The user's personal prepaid credit budget this period, or null if unavailable. */
  getCredits(): Promise<CreditBalance | null>;
  /** Start a per-person Stripe Checkout for a tier and open it in the browser.
   *  REJECTS with a user-facing (localized) message when nothing can open (signed
   *  out, already subscribed, backend/Stripe error) so the UI can explain it. */
  startCheckout(tier: string): Promise<void>;
  /** Upgrade/downgrade an ACTIVE subscription to another tier IN PLACE (no
   *  browser round-trip — a prorated Stripe price swap). REJECTS with a
   *  user-facing message on failure. Optional (absent = change via the portal). */
  changeTier?(tier: string): Promise<void>;
  /** Open the Stripe billing portal (manage/cancel/invoices) in the browser.
   *  REJECTS with a user-facing message on failure (e.g. no Stripe customer yet). */
  openPortal(): Promise<void>;
  /**
   * TESTER MODE — granting oneself a tier, without paying.
   *
   * `isTester` is a DISPLAY verdict: it decides the button's label, nothing else.
   * The real guard is redone server-side on every grant (the role is re-read from the
   * database), because a renderer decides nothing about authorisation. Fail-closed to
   * `false` — an account without the role sees the normal offer, never a dead button.
   *
   * `selfGrant(tier)` / `selfRevoke()` REJECT with a readable message, like
   * `startCheckout`: a grant failing in silence would let the tier look obtained.
   * Optional — absent on a platform with no backend (the browser preview).
   */
  isTester?(): Promise<boolean>;
  selfGrant?(tier: string): Promise<void>;
  selfRevoke?(): Promise<void>;
  /** Subscribe to the app returning from Stripe Checkout (the desktop's
   *  `<protocol>://billing/callback` deep link). The UI re-fetches the subscription so
   *  the new plan shows without a manual refresh. Returns an unsubscribe fn.
   *  Optional (absent on platforms with no deep link, e.g. the browser preview). */
  onReturn?(cb: () => void): () => void;
}
