/**
 * The FR catalogue's « availability » slice — the SOURCE language.
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys.
 */
import type { Messages } from "../messages";

export const availability = {
  includedInSubscription: (brand) => `dans l'abonnement ${brand}`,
  includedWithAccount: (brand) => `avec votre compte ${brand}`,
  keyRequired: "Clé requise",
  noKeyTitle: (p) =>
    `Aucune clé API ${p} n'est enregistrée sur cet appareil. Ajoutez-la dans Réglages → Modèles pour utiliser ce modèle`,
  noKeyOrIncluded: (included) => `, ou choisissez un modèle inclus ${included}.`,
  subscriptionRequired: "Abonnement requis",
  noCreditsSold: (brand, p) =>
    `Ce modèle passe par votre abonnement ${brand}, et vos crédits sont épuisés. Prenez un abonnement, ou renseignez votre propre clé ${p} pour l'utiliser directement.`,
  unavailable: "Indisponible",
  noCreditsUnsold: (brand, p) =>
    `Ce modèle n'est pas disponible sur votre compte ${brand} pour le moment. Renseignez votre propre clé ${p} pour l'utiliser directement.`,
  freeModeSold: (brand, p) =>
    `L'accès gratuit de ${brand} couvre Laguna et Nemotron. Pour ce modèle, prenez un abonnement ou renseignez votre propre clé ${p}.`,
  freeModeUnsold: (brand, p) =>
    `Votre compte ${brand} inclut Laguna et Nemotron. Pour ce modèle, renseignez votre propre clé ${p}.`,
  cliRequired: "CLI requise",
  cliUnavailable: (cli) =>
    `Ce modèle passe par la CLI ${cli} de cette machine. Installez-la, connectez-la, puis activez-la dans Réglages → Modèles.`,
  cliSignedOut: "Non connecté",
  cliSignedOutTitle: (cli) => `${cli} n'est plus connecté à votre compte. Reconnectez-vous pour continuer.`,
  noEndpoint: "Adresse manquante",
  noEndpointTitle: "Adresse manquante. Ajoutez-la dans Réglages → Modèles → Modèle sur votre ordinateur.",
  endpointUnreachable: "Serveur injoignable",
  endpointUnreachableTitle:
    "Votre serveur local (Ollama, LM Studio…) ne répond pas. Vérifiez qu'il est démarré.",
} satisfies Messages["availability"];
