/**
 * The words EVERYTHING renders: action verbs, main navigation, billing.
 *
 * A SLICE of the contract (`../messages.ts`), which stays the only list of namespaces.
 * The split holds the 300-LOC cap (rule 1) — same shape as `packages/emails/i18n/`.
 */

/** Verbs and action words reused everywhere — the first thing not to duplicate. */
export interface CommonMessages {
  /**
   * This language's `Intl` TAG — « fr-FR », « en-GB ».
   *
   * It lives in the catalogue so that `t` is enough to format anything: a formatter that
   * also demanded the `Locale` would force every caller to carry both, and
   * that is exactly where one ends up forgotten. Regional ON PURPOSE — « fr » is
   * not a region tag, and `toLocaleString("fr")` groups no thousands and does not
   * write the time the way « fr-FR » does.
   */
  intlTag: string;
  cancel: string;
  save: string;
  close: string;
  retry: string;
  delete: string;
  confirm: string;
  loading: string;
  /** A generic error report, when nothing more precise is known. */
  genericError: string;
}

/** The main navigation — the desktop Rail AND the mobile bar (`BottomNav`) read
 *  these same labels (rule 9: one navigation, one source). */
export interface NavMessages {
  /** Screen-reader label on the `<nav>` element. */
  ariaLabel: string;
  chats: string;
  /** Deliberately short (mobile bar) — « Compét. », « Skills ». */
  competences: string;
  memory: string;
  vault: string;
  library: string;
  settings: string;
}

/** Billing / credits. The AMOUNTS are NOT here: `Intl.NumberFormat` renders them
 *  per locale (`billing.ts` `formatCents`). Only the prose lives here. */
/** A subscription tier as the grid shows it. Price and credits come from the code. */
export interface PlanTierCopy {
  name: string;
  tag?: string;
  feats: readonly ((brand: string) => string)[];
}

export interface BillingMessages {
  /** The two CTAs: no subscription yet, or a bigger one. */
  ctaSee: string;
  ctaUpgrade: string;
  /** What one reads when the month's included usage runs out — two surfaces render it. */
  exhaustedTitle: string;
  exhaustedBody: string;
  tiers: { free: PlanTierCopy; solo: PlanTierCopy; team: PlanTierCopy };
  tierLabels: { free: string; solo: string; team: string; scale: string };
  errors: {
    disabled: string;
    testerMode: string;
    alreadyActive: string;
    noCustomer: string;
    priceNotConfigured: string;
    stripe: string;
    signIn: string;
    accountNotFound: string;
    serverDown: string;
    generic: string;
  };
  /** Failure to open the Stripe payment page. */
  checkoutOpenFailed: string;
  /** The deployment's FREE MODE (`OPENMASQ_FREE_MODE`): the Paiement tab no longer has
   *  an offer to show — everything is included. Title, explanation, and the gauge line that
   *  can no longer say « restants sur ». */
  freeModeEyebrow: string;
  freeModeTitle: string;
  freeModeBody: (brand: string) => string;
  /** « 1,20 € utilisés ce mois-ci · sans limite » — the amount comes from `Intl`. */
  freeModeUsed: (amount: string) => string;
  /** The label of the synthetic tier served in free mode (`tierLabel`). */
  unlimitedTier: string;
}
