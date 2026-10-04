/**
 * The FR catalogue's « privacy » slice — the SOURCE language.
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/privacy.ts`), no more and no less, slice by slice — so a forgotten
 * key names ITS slice rather than the whole catalogue.
 */
import type { Messages } from "../messages";

export const privacyLevels = {
  // The id stays `standard` (persisted in the settings); only the LABEL says what the
  // level is — the one below the default.
  standard: {
    label: "Allégé",
    desc: "Protège moins que le niveau par défaut. Pour la recherche web et les outils connectés.",
    short: () =>
      "Le minimum : e-mails, téléphones, numéros de carte, IBAN, numéros d'identification et clés.",
    tradeoff: "Noms, pseudos, dates, adresses, lieux et entreprises restent lisibles par le modèle.",
  },
  renforce: {
    label: "Renforcé",
    desc: "Le niveau par défaut. Pour la rédaction, les e-mails et le travail courant.",
    short: () =>
      "Ajoute les noms de personnes et d'entreprises, les pseudos, les dates de naissance, adresses et lieux que vous citez.",
    tradeoff:
      "Un âge ou une distance calculés sur une valeur masquée peuvent être faux. La zone de saisie vous le signale.",
  },
  strict: {
    label: "Strict",
    desc: "Pour analyser des documents.",
    short: (brand) => `La totalité de ce que ${brand} sait détecter, sans exception.`,
    tradeoff:
      "Le modèle travaille sur des substituts : les calculs et les réponses sur le monde réel peuvent être faux.",
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
  id: "Numéro d'identification",
  card: "Numéro de carte",
  iban: "IBAN",
  ip: "Adresse IP",
  path: "Chemin de fichier",
  dob: "Date de naissance",
  secret: "Secret / clé",
} satisfies Messages["redactTypes"];

export const webNav = {
  ariaLabel: "Navigation web : niveau de protection pour cette recherche",
  eyebrow: "Navigation web",
  thisMessageOnly: "Ce message seulement.",
  keepMasking: "Garder le masquage",
  title: (level) => `Chercher sur le web avec la protection ${level} ?`,
  rest: "Tout le reste est toujours masqué pour le modèle. Votre requête de recherche est de toute façon envoyée avec les vraies valeurs.",
} satisfies Messages["webNav"];
