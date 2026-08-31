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
  /** Un OCTROI (palier inclus / accès donné) et non une vente — aucun abonnement Stripe
   *  derrière, donc rien que `changeTier` puisse échanger : la route est la CAISSE
   *  (`state/billing.ts` `tierAction`). Absent ⇒ `false`, le comportement d'un abonné. */
  isGranted?: boolean;
  /**
   * Le déploiement peut-il ENCAISSER ? `false` = l'offre s'affiche (mêmes paliers, mêmes
   * montants) mais souscrire et gérer sont fermés côté serveur (503 `BILLING_DISABLED`).
   *
   * ⚠️ `undefined` ne veut PAS dire « fermé » : c'est une plateforme ou un backend plus
   * ancien qui ne le dit pas. Le lire comme fermé griserait les boutons d'un déploiement
   * parfaitement fonctionnel — l'inconnu laisse donc l'action ouverte, et c'est le 503
   * qui tranche, avec son message. Fermer sur un doute est ici la MAUVAISE direction :
   * rien d'irréversible n'est en jeu, seulement un clic qui explique pourquoi.
   */
  billingEnabled?: boolean;
  /**
   * Le MODE TESTEUR du déploiement : tout compte connecté peut s'octroyer un palier sans
   * payer. Global — tout le monde ou personne, jamais nominatif.
   *
   * ⚠️ Ici l'inconnu se lit comme ÉTEINT, à l'inverse de `billingEnabled`, et la raison est
   * la même dans les deux cas : ne jamais promettre ce qu'on ne peut pas tenir. Griser
   * « S'abonner » à tort ferme une action qui marche ; afficher « S'octroyer » à tort
   * propose un bouton MORT, que le serveur refusera.
   */
  selfGrantEnabled?: boolean;
  /**
   * Le MODE GRATUIT du déploiement (`OPENMASQ_FREE_MODE`) : personne ne paie, les crédits
   * sont illimités, rien ne se vend. L'onglet Paiement remplace la grille par « tout est
   * inclus » (`FreeModeBilling`). Le serveur sert alors `tier: "unlimited"` — un palier
   * qui OUVRE l'accès aux modèles inclus (`send/modelAvailability.ts` ne bloque que
   * `"free"`) sans être une carte vendue. Absent ⇒ éteint : un backend plus ancien ne le
   * dit pas, et l'offre normale est le bon repli.
   */
  freeMode?: boolean;
}

/** A prepaid credit budget (eurocents). Shared by org + individual surfaces. */
export interface CreditBalance {
  blocked: boolean;
  allotmentCents: number;
  consumedCents: number;
  balanceCents: number;
  /** Mode gratuit : aucun plafond. `allotmentCents`/`balanceCents` valent 0 et ne veulent
   *  rien dire — la jauge affiche la consommation seule, jamais « 0 € restants ». */
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
   * Le MODE TESTEUR — s'octroyer un palier à soi-même, sans payer.
   *
   * `isTester` est un verdict d'AFFICHAGE : il décide du libellé du bouton, rien d'autre.
   * La garde réelle est refaite côté serveur à chaque octroi (le rôle est relu en base),
   * parce qu'un renderer ne décide de rien en matière d'autorisation. Fail-closed à
   * `false` — un compte sans le rôle voit l'offre normale, jamais un bouton mort.
   *
   * `selfGrant(tier)` / `selfRevoke()` REJETTENT avec un message lisible, comme
   * `startCheckout` : un octroi qui échoue en silence laisserait croire au palier obtenu.
   * Optionnels — absents sur une plateforme sans backend (l'aperçu navigateur).
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
