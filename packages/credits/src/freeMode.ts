/**
 * Le MODE GRATUIT d'un déploiement — `OPENMASQ_FREE_MODE=1`.
 *
 * Allumé, personne ne paie et rien ne se vend : les crédits sont ILLIMITÉS (`credits.ts`
 * ne bloque plus, la passerelle ne pré-refuse plus), la caisse est fermée côté backend
 * (`isBillingEnabled()` ⇒ faux, donc 503 `BILLING_DISABLED` sur tout ce qui engage de
 * l'argent) et l'app remplace la grille d'offres par « tout est inclus ». C'est le mode
 * d'un déploiement AUTO-HÉBERGÉ qui n'a pas de Stripe et ne veut pas de plafond.
 *
 * ## Un fait DÉRIVÉ, jamais un réglage
 *
 * Rien n'est écrit en base : ni ligne d'abonnement, ni type de compte. Retirer la
 * variable restaure exactement l'état d'avant — chaque compte retrouve son palier réel
 * (inclus, octroyé ou payé) et son enveloppe. C'est ce qui le distingue du mode testeur
 * (`app_settings`, octrois persistés) : celui-ci se reprend compte par compte, le mode
 * gratuit s'éteint d'un redéploiement.
 *
 * ## Une maison, DEUX services
 *
 * Ce prédicat vit ici parce que `@openmasq/credits` est importé par le backend ET par la
 * passerelle — le seul endroit où une même lecture sert les deux. ⚠️ Chacun lit SON
 * environnement : la variable se pose sur les deux déploiements, sinon l'app affiche
 * « tout inclus » pendant que la passerelle répond 402 (`SELF_HOSTING.md`).
 *
 * ## Ce qu'il ne fait PAS
 *
 * - Il n'annule aucun abonnement Stripe existant : Stripe continue de prélever ce qu'il
 *   prélevait. Le mode gratuit est pensé pour une cible SANS clé Stripe ; sur une cible
 *   qui en a une, l'opérateur résilie lui-même dans Stripe.
 * - Il ne touche pas aux modèles à clé personnelle ni aux modèles locaux — ils n'ont
 *   jamais dépendu des crédits.
 *
 * ⚠️ Lu à CHAQUE appel, jamais figé au chargement : sur une fonction serverless le module
 * survit au déploiement qui pose (ou retire) la variable. Même règle que
 * `billingEnabled.ts` côté backend. Seule la valeur `"1"` allume — un `"true"`, un
 * `"yes"` ou un espace se lisent éteints, fail-closed sur le sens qui ouvre l'accès.
 */
export const FREE_MODE_ENV = "OPENMASQ_FREE_MODE";

export function isFreeMode(env: Record<string, string | undefined> = process.env): boolean {
  return env[FREE_MODE_ENV] === "1";
}
