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
    interrupted: "Réponse interrompue",
    empty: "Réponse vide",
    tool: "Étape échouée",
    limit: "Limite atteinte",
  },
  retry: "Réessayer",
  fillKey: "Renseigner la clé",
  failedDefault: "La réponse a échoué.",
  interrupted: "La réponse a été coupée avant la fin.",
  empty: "Le modèle n'a rien renvoyé.",
  toolFlowFailed:
    "Une étape du flux d'outils a échoué. Réessayer relance le flux (les étapes réussies sont rejouées ; chaque écriture redemande confirmation).",
  credits: {
    title: "Vos crédits offerts sont épuisés",
    // « sans crédits » also read as « sans avoir de crédits » — the opposite meaning.
    desc: (brand, keyName) =>
      `Prenez un abonnement pour continuer avec les modèles fournis par ${brand}, ou envoyez avec votre propre clé ${keyName} — elle ne touche pas à vos crédits.`,
    resetOn: (date) => `Réinitialisation le ${date}`,
    useKey: (name) => `Utiliser ma clé ${name}`,
    useKeyTip: (name) => `Renseigner votre clé ${name}`,
    used: (amount) => `${amount} utilisés`,
    left: (amount) => `${amount} restants`,
  },
} satisfies Messages["turnStatus"];
