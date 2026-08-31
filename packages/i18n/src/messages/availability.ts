/**
 * Why a model CANNOT send — the picker's chip and its tooltip.
 *
 * ⚠️ Two build flags change the sentence: `served` (this build has a hosted service)
 * and `sold` (it SELLS subscriptions). A build that sells nothing says neither « abonnement »
 * nor « crédits »: the model is not open on this account, and the key is the way out.
 * `send/platformAccess.test.ts` pins those absences; a translation reintroducing
 * the word where it is forbidden would send people hunting for a subscription that is not there.
 *
 * A SLICE of the contract (`../messages.ts`), which stays the only list of namespaces.
 */
export interface AvailabilityMessages {
/** « dans l'abonnement X » when it sells, « avec votre compte X » otherwise. */
  includedInSubscription: (brand: string) => string;
  includedWithAccount: (brand: string) => string;
  keyRequired: string;
  noKeyTitle: (provider: string) => string;
  /** The second way out, added ONLY if this build has a hosted service. */
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
