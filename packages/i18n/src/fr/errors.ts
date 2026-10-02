/**
 * The FR catalogue's « errors » slice — the SOURCE language.
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/errors.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const errors = {
  theProvider: "chez le fournisseur",
  atProvider: (provider) => `chez ${provider}`,

  creditsUnverifiable: "Impossible de vérifier vos crédits. Rien n'a été envoyé. Réessayez.",
  modelNotAllowed: (brand) =>
    `Ce modèle n'est pas disponible avec votre compte ${brand}. Choisissez-en un autre.`,
  upstreamUnavailable: (brand) =>
    `${brand} n'a pas pu joindre le fournisseur. Réessayez, ou changez de modèle.`,
  providerCreditsNamed: (provider) =>
    `Votre compte ${provider} n'a plus de crédits. Rechargez-le chez ${provider}, ou changez de modèle.`,
  providerCredits:
    "Votre compte chez le fournisseur n'a plus de crédits. Rechargez-le, ou changez de modèle.",
  invalidKeyNamed: (provider) =>
    `Votre clé ${provider} a été refusée. Vérifiez-la, ou renseignez-en une nouvelle.`,
  invalidKey: "Votre clé a été refusée par le fournisseur. Vérifiez-la, ou renseignez-en une nouvelle.",
  cliSessionExpired: (cli) => `Votre session ${cli} a expiré. Reconnectez-vous pour continuer.`,
  cliSessionExpiredExternal: (cli) =>
    `Votre session ${cli} a expiré. Reconnectez-vous depuis ${cli}, puis réessayez.`,
  rateBurst: (wait) => `Trop de requêtes d'un coup. Attendez ${wait} et réessayez.`,
  someSeconds: "quelques secondes",
  freeCap: (limit) => `${limit} requêtes gratuites`,
  freeCapPlain: "requêtes gratuites",
  dailyExhausted: (cap, when) => `Vos ${cap} du jour sont épuisées.${when}`,
  quotaExhausted: (atProvider, when) => `Votre quota ${atProvider} est épuisé pour le moment.${when}`,
  resetsAt: (when) => ` Réinitialisation ${when}.`,
  modelStall:
    "Le modèle n'a pas répondu. Cela arrive souvent avec trop de connecteurs actifs. Essayez d'en déconnecter quelques-uns.",

  waitSeconds: (s) => `~${s} s`,
  waitMinutes: (m) => `~${m} min`,
  resetToday: (time) => `à ${time}`,
  resetTomorrow: (time) => `demain à ${time}`,
  resetOnDate: (date, time) => `le ${date} à ${time}`,

  quotaResetsAt: (when) => ` Il se réinitialise ${when}.`,
  quotaEmpty: (when) =>
    `Votre quota de requêtes sur ce modèle est épuisé.${when} Changez de modèle sous le message pour continuer.`,
  quotaLeft: (n, ofLimit, when) =>
    `Il vous reste ${n} requête${n > 1 ? "s" : ""} sur ce modèle${ofLimit}.${when} Ensuite, changez de modèle ou attendez.`,
  quotaOfLimit: (limit) => ` (sur ${limit})`,

  interruptedBeforeSend: "Interrompu avant l'appel au modèle. Rien n'a été envoyé.",
  exportedFileLost: "fichier exporté impossible à récupérer, réessayez",
  replyInterrupted: "La réponse s'est interrompue en cours de route. Réessayez, ou changez de modèle.",
  replyNeverStarted: "Le modèle n'a pas commencé à répondre. Réessayez, ou changez de modèle.",
} satisfies Messages["errors"];
