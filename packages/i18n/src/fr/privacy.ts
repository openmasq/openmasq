/**
 * Tranche « privacy » du catalogue FR — la langue SOURCE.
 *
 * `satisfies` par entrée : le compilateur exige EXACTEMENT les clés du contrat
 * (`../messages/privacy.ts`), ni plus ni moins, tranche par tranche — donc une clé
 * oubliée nomme SA tranche plutôt que le catalogue entier.
 */
import type { Messages } from "../messages";

export const privacyLevels = {
  standard: {
    label: "Standard",
    desc: "Parfait pour l'utilisation agentique du web.",
    short: () =>
      "Le strict minimum sur vos données personnelles : e-mails, téléphones, cartes bancaires, IBAN, données de santé.",
    tradeoff: "Noms, dates, adresses, lieux et entreprises restent lisibles par le modèle.",
  },
  renforce: {
    label: "Renforcé",
    desc: "Parfait pour l'utilisation agentique hors web.",
    short: () =>
      "Va plus loin : ajoute les noms de personnes, d'entreprises et les identifiants que vous citez.",
    tradeoff:
      "Un âge ou une distance calculés sur une valeur masquée peuvent être décalés — le composeur le signale.",
  },
  strict: {
    label: "Strict",
    desc: "Parfait pour l'analyse de documents.",
    short: (brand) => `La totalité de ce que ${brand} sait détecter, sans exception.`,
    tradeoff:
      "Le modèle raisonne sur des valeurs fictives : calculs et réponses sur le monde réel peuvent être faux.",
  },
} satisfies Messages["privacyLevels"];

export const redactTypes = {
  name: "Nom",
  username: "Pseudo",
  email: "E-mail",
  phone: "Téléphone",
  company: "Entreprise",
  address: "Adresse",
  city: "Ville",
  id: "Identifiant",
  card: "Carte bancaire",
  iban: "IBAN",
  ip: "Adresse IP",
  path: "Chemin de fichier",
  dob: "Date de naissance",
  secret: "Secret / clé",
} satisfies Messages["redactTypes"];

export const webNav = {
  ariaLabel: "Navigation web — niveau de protection pour cette recherche",
  eyebrow: "Navigation web",
  thisMessageOnly: "Ce message seulement.",
  keepMasking: "Garder le redaction",
  switchTo: (level) => `Passer en ${level}`,
  title: (level) => `Chercher sur le web en protection ${level} ?`,
  rest: "Tout le reste demeure redacted, et votre requête part de toute façon avec la vraie valeur.",
} satisfies Messages["webNav"];
