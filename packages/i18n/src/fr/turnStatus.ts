/**
 * The FR catalogue's « turnStatus » slice — the SOURCE language.
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/turnStatus.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const turnStatus = {
  eyebrow: {
    sendBlocked: "Envoi impossible",
    quota: "Quota épuisé",
    keyRequired: "Clé requise",
    planRequired: "Abonnement requis",
    signedOut: "Session expirée",
    interrupted: "Réponse interrompue",
    empty: "Réponse vide",
    tool: "Étape échouée",
    limit: "Limite atteinte",
  },
  retry: "Réessayer",
  fillKey: "Renseigner la clé",
  reconnect: "Se reconnecter",
  reconnectTitle: (cli) => `Reconnecter ${cli}`,
  failedDefault: "La réponse a échoué.",
  interrupted: "La réponse a été coupée avant la fin.",
  empty: "Le modèle n'a rien renvoyé.",
  toolFlowFailed:
    "Une étape d'outil a échoué. Réessayer relance toutes les étapes, et chaque modification redemande votre confirmation.",
  credits: {
    title: "Vos crédits offerts sont épuisés",
    // « sans crédits » also read as « sans avoir de crédits » — the opposite meaning.
    desc: (brand, keyName) =>
      `Prenez un abonnement pour continuer avec les modèles fournis par ${brand}, ou utilisez votre propre clé ${keyName} : elle n'utilise pas vos crédits.`,
    resetOn: (date) => `Réinitialisation le ${date}`,
    useKey: (name) => `Utiliser ma clé ${name}`,
    useKeyTip: (name) => `Renseigner votre clé ${name}`,
    used: (amount) => `${amount} utilisés`,
    left: (amount) => `${amount} restants`,
  },
} satisfies Messages["turnStatus"];
