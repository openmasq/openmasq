/**
 * **Ce build a-t-il un service hébergé ?** — c'est-à-dire une passerelle d'inférence ET
 * des comptes, les deux moitiés sans lesquelles un modèle « inclus » n'a ni endpoint ni
 * jeton. C'est une constante de BUILD (l'app ne peut pas en gagner un en route), au même
 * titre que `BRAND` : d'où un foyer unique plutôt qu'un drapeau qu'on ferait descendre
 * dans chaque composant qui parle d'abonnement.
 *
 * Sans elle, un build sans backend (le cas open source par défaut — `SELF_HOSTING.md`)
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

/** Appelé UNE fois par l'hôte, au démarrage, depuis ce que le build a reçu. */
export function configurePlatformAccess(opts: { served: boolean }): void {
  served = opts.served;
}

/** Les modèles servis par la plateforme sont-ils joignables dans ce build ? */
export function platformAccessServed(): boolean {
  return served;
}
