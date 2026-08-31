import type { Messages } from "@openmasq/i18n";
/**
 * **Ce build a-t-il un service hébergé ?** — c'est-à-dire une passerelle d'inférence ET
 * des comptes, les deux moitiés sans lesquelles un modèle « inclus » n'a ni endpoint ni
 * jeton. C'est une constante de BUILD (l'app ne peut pas en gagner un en route), au même
 * titre que `BRAND` : d'où un foyer unique plutôt qu'un drapeau qu'on ferait descendre
 * dans chaque composant qui parle d'abonnement (et `sold`, plus bas, pour l'abonnement lui-même).
 *
 * Sans elle, un build sans backend (le cas open source par défaut ; les services vivent dans le dépôt privé `infra`)
 * offrait quand même les modèles de la plateforme et disait « prenez un abonnement » :
 * deux affirmations fausses. Avec elle, ces mêmes modèles redeviennent ce qu'ils sont
 * vraiment sur cette machine — des modèles à CLÉ, dont la clé de l'utilisateur est la
 * seule porte (`resolveEffectivePlatform`).
 *
 * ⚠️ Le défaut est `true` (le comportement historique) : l'hôte qui n'appelle pas
 * `configurePlatformAccess` — l'aperçu web, un harnais de test — se comporte comme
 * avant. Se tromper dans ce sens coûte une phrase inexacte et une erreur d'envoi
 * explicite, jamais une frontière ouverte : la passerelle vérifie le jeton de son côté,
 * et rien ici ne décide ce qui SORT.
 */
let served = true;

/**
 * **Ce build VEND-il des abonnements ?** — la seconde constante de build, et son défaut
 * est l'inverse du premier : `false`. Rien ne se vend tant que le build ne le dit pas
 * (`OPENMASQ_BILLING=1`, `apps/desktop/scripts/buildDefines.ts`). Éteint, TOUT ce qui
 * parle d'abonnement disparaît — l'onglet Paiement (l'hôte ne branche pas `billing`), les
 * pastilles « Abonnement requis », les cartes « Prenez un abonnement », le mur payant de
 * la synchro, l'étape « Abonnement, ou votre clé » — et la voie « modèles inclus » se
 * nomme par ce qu'elle est alors : *votre compte*. Un modèle inclus reste inclus ; seul
 * le mot qui le vend s'en va.
 *
 * ⚠️ Deux constantes, pas une : « servi » (il y a des modèles inclus) et « vendu » (on
 * les fait payer) restent distincts — une pile auto-hébergée saisie dans l'app sert sans
 * vendre, et un serveur en `OPENMASQ_FREE_MODE=1` sert sans encaisser. Côté desktop,
 * `OPENMASQ_BILLING=1` est aussi la porte qui laisse entrer l'API et la passerelle au
 * build : sans elle, rien de distant hormis l'auth, Slack, les analytics et les mises à
 * jour. Le défaut `false` est celui du produit, pas un mode dégradé : dire « abonnement »
 * à qui ne peut rien acheter est la phrase fausse.
 */
let sold = false;

/** Appelé UNE fois par l'hôte, au démarrage, depuis ce que le build a reçu. `sold`
 *  omis ⇒ rien à vendre. */
export function configurePlatformAccess(opts: { served: boolean; sold?: boolean }): void {
  served = opts.served;
  sold = opts.sold === true;
}

/** Les modèles servis par la plateforme sont-ils joignables dans ce build ? */
export function platformAccessServed(): boolean {
  return served;
}

/** Ce build vend-il des abonnements ? `false` par défaut — voir `sold` ci-dessus. */
export function subscriptionsSold(): boolean {
  return sold;
}

/** Comment une phrase nomme la voie « modèles inclus » : « dans l'abonnement X » quand
 *  elle se vend, « avec votre compte X » sinon. UN foyer, parce que la même incise
 *  revient sous la pastille, dans le refus d'envoi et sur le libellé de groupe. */
export function includedWith(brand: string, t: Messages): string {
  return sold ? t.availability.includedInSubscription(brand) : t.availability.includedWithAccount(brand);
}
