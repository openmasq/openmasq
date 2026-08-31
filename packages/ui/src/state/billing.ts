import { BRAND } from "@openmasq/branding";
import { DEFAULT_LOCALE, type Locale, type Messages, type PlanTierCopy } from "@openmasq/i18n";
import { subscriptionsSold } from "../send/platformAccess";
// Canonical plan-tier catalog (Free / Solo / Team) — the single vocabulary the desktop
// + extension read. The backend catalog (GET /subscriptions/prices) is the pricing
// source of truth; these amounts mirror it for display when a live fetch isn't wired.
// Per seat (org) or per person (individual). Amounts in eurocents. Credits = the
// prepaid monthly model-usage budget included.
//
// ⚠️ Solo et Team ont le MÊME prix et la MÊME enveloppe, exprès : la carte doit donc
// vendre le CADRE (règles imposées, modèles et connecteurs autorisés, facture unique),
// pas le volume. Une carte Team qui promettrait « plus de crédits » serait fausse.
//
// ⚠️ `scale` a quitté le catalogue vendu. Le slug survit dans `TierSlug` + `LABEL` pour
// qu'un compte encore sur Scale s'AFFICHE correctement ; il n'a simplement plus de carte
// à acheter. Voir `RETIRED_TIERS` côté backend.

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

/** La grille des paliers dans la langue de `t`. Prix, crédits et « recommandé » sont des
 *  FAITS de l'offre et restent ici ; nom, étiquette et arguments viennent du catalogue. */
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
  // `PRO` est l'ancien nom serveur du palier Team ; les autres clés sont des slugs.
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
  // Rien à vendre dans ce build (`subscriptionsSold`, le défaut) ⇒ jamais de pitch, quel
  // que soit le palier : c'est la seule porte que chaque surface d'upsell relit.
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

/** Ce qu'un clic sur une carte de palier doit DÉCLENCHER. */
export type TierAction = "self-grant" | "change-tier" | "checkout";

/**
 * Où va un clic sur un autre palier. Pur et testé (`billing.test.ts`) parce que la seule
 * branche qui compte ici est celle qui s'est trompée.
 *
 * ⚠️ « Abonné » n'est PAS « palier ≠ gratuit ». Un **octroi** — le palier Solo inclus que
 * tout compte reçoit en arrivant, ou un accès donné par un admin — affiche un palier sans
 * qu'aucun abonnement Stripe n'existe derrière. `change-tier` échange le prix d'un
 * abonnement Stripe : sur un octroi il n'a rien à échanger et répond `409 NO_SUBSCRIPTION`.
 * Le confondre envoyait donc TOUS les comptes sur la route morte — plus personne
 * n'achetait, à aucun palier. Un octroi passe par la CAISSE, comme un compte gratuit.
 *
 * `canChangeTier` = l'hôte sait-il exécuter le changement sur place (l'aperçu web et le
 * mobile ne l'ont pas) — sinon la caisse, qui elle existe partout.
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
 * `/subscriptions/*` needs the same wording — desktop and mobile both import it, and
 * a second copy would drift on the day a new backend code appears (root rule 9).
 *
 * The getters may stay silent (they return null), but an ACTION — checkout, portal,
 * change-tier — that opens nothing MUST say why.
 */
/**
 * L'échec d'une action de paiement tel que l'HÔTE le remonte : un statut et un code borné,
 * jamais une phrase. La phrase se choisit dans l'UI (`billingErrorMessage`), dans la langue
 * de l'interface — un hôte qui la formulait figeait le français dans `apps/desktop`.
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

/** Formate des centimes d'euro comme un montant EUR, dans la LOCALE donnée (« 1,00 € »
 *  en français, « €1.00 » en anglais). La devise reste l'euro — le produit est facturé en
 *  euros — seul le FORMAT suit la langue, via `Intl` (pas le catalogue : un nombre n'est
 *  pas une phrase). Défaut = langue source, pour les appelants encore hors contexte React. */
export function formatCents(cents: number, locale: Locale = DEFAULT_LOCALE): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: "eur" }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} €`;
  }
}
