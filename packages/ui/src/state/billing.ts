import { BRAND } from "@openmasq/branding";
import { DEFAULT_LOCALE, type Locale } from "@openmasq/i18n";
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

export const PLAN_TIERS: PlanTier[] = [
  {
    tier: "free",
    name: "Gratuit",
    priceCents: 0,
    creditsCents: 0,
    tag: "Dès l'inscription",
    feats: [`Redaction géré par ${BRAND.name}`, "Modèles essentiels", "1 appareil", "Historique 30 jours"],
  },
  {
    tier: "solo",
    name: "Solo",
    priceCents: 1200,
    creditsCents: 800,
    feats: [
      "Tout Gratuit, plus :",
      "Tous les modèles dans un fil",
      "Synchro multi-appareils",
      "Historique illimité",
    ],
  },
  {
    tier: "team",
    name: "Team",
    priceCents: 1200,
    creditsCents: 800,
    recommended: true,
    // Même prix que Solo : ce que Team ajoute est le CADRE, jamais le volume.
    feats: [
      "Tout Solo, pour chaque membre, plus :",
      "Règles de redaction imposées",
      "Modèles et connecteurs autorisés",
      "Facture unique et journal d'audit",
    ],
  },
];

const LABEL: Record<string, string> = {
  free: "Free",
  solo: "Solo",
  team: "Team",
  scale: "Scale",
  // legacy account types
  FREE: "Free",
  PRO: "Team",
};

/** Display label for a tier slug / legacy account type. */
export function tierLabel(tier?: string | null): string {
  if (!tier) return "Free";
  return LABEL[tier] ?? LABEL[tier.toLowerCase()] ?? tier;
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
export function billingErrorMessage(status: number, code?: string): string {
  switch (code) {
    case "BILLING_DISABLED":
      // Le déploiement n'a pas de clé Stripe : l'offre s'affiche, l'achat est fermé. Dire
      // « réessayez » serait faux (rien ne changera à la prochaine tentative) et « erreur »
      // ferait croire à une panne — c'est un état, et il se dit tel quel.
      return "Les abonnements ne sont pas encore ouverts sur cette version. L'offre est affichée à titre indicatif.";
    case "TESTER_MODE_ENABLED":
      // Un ÉTAT du déploiement, pas une panne : « réessayez » serait faux, rien ne
      // changera au prochain clic tant que l'interrupteur est allumé.
      //
      // ⚠️ Ne PAS nommer un bouton « S'octroyer » : en mode testeur le libellé ne change
      // pas, seul l'effet change (décision du 14/08). Et qui lit ce message est justement
      // sur une version qui ignore le mode — sinon elle n'aurait pas ouvert de caisse.
      return "Ce déploiement n'encaisse pas les abonnements : les offres s'y activent sans paiement, depuis une application à jour.";
    case "SUBSCRIPTION_ALREADY_ACTIVE":
      return "Un abonnement est déjà actif sur ce compte — utilisez « Ouvrir le portail » pour le gérer.";
    case "NO_STRIPE_CUSTOMER":
      return "Aucun abonnement à gérer pour l'instant — abonnez-vous d'abord.";
    case "STRIPE_PRICE_NOT_CONFIGURED":
      return "La facturation n'est pas encore configurée côté serveur. Contactez le support.";
    case "STRIPE_API_ERROR":
      return "Erreur Stripe temporaire. Réessayez dans un instant.";
  }
  if (status === 401) return "Connectez-vous pour gérer votre abonnement.";
  if (status === 404) return "Compte introuvable — reconnectez-vous.";
  if (status >= 500) return "Le service de paiement ne répond pas. Réessayez dans un instant.";
  return "Impossible d'ouvrir la page de paiement. Réessayez.";
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
