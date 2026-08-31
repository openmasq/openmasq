/**
 * Pourquoi un modèle NE PEUT PAS envoyer — la pastille du sélecteur et son infobulle.
 *
 * ⚠️ Deux drapeaux de build changent la phrase : `served` (ce build a un service hébergé)
 * et `sold` (il VEND des abonnements). Un build qui ne vend rien ne dit ni « abonnement »
 * ni « crédits » : le modèle n'est pas ouvert sur ce compte, et la clé est l'issue.
 * `send/platformAccess.test.ts` épingle ces absences ; une traduction qui réintroduirait
 * le mot là où il est interdit ferait chercher un abonnement introuvable.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 */
export interface AvailabilityMessages {
  /** « dans l'abonnement X » quand il se vend, « avec votre compte X » sinon. */
  includedInSubscription: (brand: string) => string;
  includedWithAccount: (brand: string) => string;
  keyRequired: string;
  noKeyTitle: (provider: string) => string;
  /** La seconde issue, ajoutée SEULEMENT si ce build a un service hébergé. */
  noKeyOrIncluded: (included: string) => string;
  subscriptionRequired: string;
  noCreditsSold: (brand: string, provider: string) => string;
  unavailable: string;
  noCreditsUnsold: (brand: string, provider: string) => string;
  freeModeSold: (brand: string, provider: string) => string;
  freeModeUnsold: (brand: string, provider: string) => string;
  cliRequired: string;
  cliUnavailable: (cli: string) => string;
  noEndpoint: string;
  noEndpointTitle: string;
  endpointUnreachable: string;
  endpointUnreachableTitle: string;
}
