/**
 * The FR catalogue's « redactionCatalog » slice — the SOURCE language. Generated from
 * `@openmasq/catalog/redaction` et `@openmasq/redact` (sections). `satisfies` per entry.
 */
import type { Messages } from "../messages";

export const redactionCatalog = {
  categories: {
    name: {
      label: "Noms & prénoms",
      detail:
        "Prénoms, noms et identités complètes repérés par la détection sur l'appareil, y compris en MAJUSCULES, collés ou dans un champ étiqueté (Nom :, Prénom(s) :). Les personnalités publiques ne sont pas masquées par défaut.",
    },
    dob: {
      label: "Date de naissance",
      detail:
        "Dates de naissance (né le…, date of birth, formats FR/EN/DE), champs étiquetés inclus. Les autres dates relèvent de « Dates », éteinte par défaut.",
      impact:
        "Une fois la date masquée, un âge ou un délai calculé par le modèle peut être décalé : la date de substitution cache aussi l'année réelle, qui peut identifier une personne. La date affichée est toujours la vraie.",
    },
    date: {
      label: "Dates",
      detail:
        "Toutes les autres dates, en chiffres (12/05/2024, 2024-05-12, 20240512) ou en lettres (12 mai 2024, May 12, 2024, mai 2024), et les heures (14:30, 8:15 AM, 07h30), dans les langues du produit. Éteinte par défaut ; le niveau Strict l'allume. Les années seules et les durées ne sont jamais masquées.",
      impact:
        "Une fois les dates masquées, les durées, délais et chronologies calculés par le modèle portent sur des dates de substitution. Elles sont décalées de quelques années mais restent cohérentes entre elles. Les vraies dates sont toujours rétablies.",
    },
    username: {
      label: "Pseudo / identifiant",
      detail: "Pseudos @handle et champs login / nom d'utilisateur / nickname.",
    },
    email: {
      label: "E-mail",
      detail:
        "Adresses e-mail. Le substitut garde un prénom cohérent, pour qu'une formule comme « Bonjour X » soit bien rétablie.",
    },
    phone: {
      label: "Téléphone",
      detail:
        "Numéros français et internationaux (+33, 00…). Les numéros internationaux sont vérifiés selon les règles de chaque pays.",
    },
    address: {
      label: "Adresse postale",
      detail:
        "Adresses complètes multilingues (FR/EN/DE/ES/IT/PT/NL + CJK), remplacées par une adresse réaliste du même pays, dans une autre région.",
      impact:
        "Une fois l'adresse masquée, elle reste cohérente (même pays, même forme), mais tout calcul géographique (distance, proximité, secteur) porte sur le lieu de substitution.",
    },
    location: {
      label: "Lieu / ville / code postal",
      detail:
        "Villes, codes postaux, départements, régions, lieux de naissance. Les pays ne sont jamais masqués (culture générale).",
      impact:
        "Une fois les lieux masqués, distances, trajets et juridictions sont raisonnés sur des lieux de substitution. Ils restent cohérents entre eux, mais pas avec la carte réelle.",
    },
    company: {
      label: "Entreprise",
      detail:
        "Noms d'entreprises et d'organisations repérés par la détection sur l'appareil. Les grandes marques, produits et indices connus ne sont pas masqués par défaut. Les numéros d'immatriculation (SIREN, TVA…) relèvent d'« Identifiants d'entreprise ».",
      impact:
        "Une fois l'entreprise masquée, le modèle ne sait rien d'elle (secteur, taille, convention collective), car le nom de substitution est fictif.",
    },
    card: {
      label: "Carte bancaire",
      detail: "Numéros de carte de 13 à 19 chiffres vérifiés par l'algorithme de Luhn. Espaces et tirets acceptés.",
    },
    iban: {
      label: "IBAN / coordonnées bancaires",
      detail:
        "IBAN (mod-97), BIC/SWIFT, et les codes de routage : ABA (US), sort code (UK), BSB (AU), CLABE (MX), IFSC (IN), numéros de compte étiquetés.",
    },
    national_id: {
      label: "ID national / passeport / permis",
      detail:
        "Documents d'identité de 40+ pays : CNI, passeports, NIR/sécurité sociale, permis de conduire, titres de séjour, numéros fiscaux, MRZ de documents scannés, SSN/ITIN, NHS, PESEL, AVS suisse, registre belge, CPF brésilien, carte d'identité chinoise, HKID, My Number… plus plaques d'immatriculation, VIN et IMEI. Les clés de contrôle sont vérifiées quand le pays en publie une.",
    },
    company_id: {
      label: "Identifiants d'entreprise",
      detail:
        "SIREN/SIRET/RCS, TVA intracommunautaire (FR + UE), LEI, registres du commerce (HR allemand, UEN Singapour, ABN/ACN Australie, CNPJ Brésil, EIN US), numéros d'organisation.",
    },
    ip: {
      label: "Adresse IP",
      detail:
        "IPv4, IPv6 (formes compressées :: comprises) et adresses MAC, remplacées par des adresses valides.",
    },
    path: {
      label: "Chemins de fichiers",
      detail:
        "Chemins absolus (macOS/Windows/Linux) et noms de fichiers et dossiers personnels (documents, images, archives). Le code source n'est pas visé.",
    },
    url: {
      label: "Adresses web (URL)",
      detail:
        "Masque l'adresse entière (domaine, chemin et paramètres), pas seulement son contenu. Éteinte, les URL restent lisibles et rien à l'intérieur n'est masqué par erreur (noms de fichiers, jetons de cache d'une page), mais les clés qu'elles contiennent restent masquées. Activée au niveau Strict, pour l'analyse de documents.",
    },
    secret: {
      label: "Clés & secrets",
      detail:
        "Clés d'accès (OpenAI, AWS, Stripe, GitHub, Slack…), jetons de connexion, clés privées, mots de passe, codes OTP/PIN, portefeuilles crypto.",
    },
    apikey: {
      label: "Chaînes type clé (générique)",
      detail:
        "Règle large : masque toute chaîne qui ressemble à une clé (long mélange de lettres et de chiffres). Active à tous les niveaux de protection, car une clé manquée serait envoyée non masquée. Elle peut aussi attraper des références produit inoffensives.",
    },
  },
  sections: {
    Identité: "Identité",
    Contact: "Contact",
    Localisation: "Localisation",
    Organisation: "Organisation",
    Financier: "Financier",
    Identifiants: "Identifiants",
    Réseau: "Réseau",
    Système: "Système",
    Secrets: "Secrets",
  },
  kinds: {
    company_id: "Identifiants d'entreprise",
    url: "Adresses web",
    salary: "Salaires",
    health: "Santé",
    name: "Noms",
    dob: "Dates de naissance",
    date: "Dates",
    username: "Pseudos / identifiants",
    email: "Adresses e-mail",
    phone: "Numéros de téléphone",
    address: "Adresses postales",
    location: "Lieux",
    company: "Noms d'entreprise",
    card: "Cartes bancaires",
    iban: "IBAN",
    national_id: "Identifiants nationaux",
    ip: "Adresses IP",
    number: "Nombres",
    path: "Chemins de fichiers",
    secret: "Clés & secrets",
    apikey: "Chaînes de type clé",
  },
  lockedByOrg: "Imposée par votre organisation",
  modified: "modifié",
  detailAria: (label) => `Détail — ${label}`,
  detailTip: "Voir ce que cette catégorie couvre",
  neutralKind: "élément",
  allOn: "Tout activer",
  allOff: "Tout désactiver",
  reset: "Rétablir les réglages par défaut",
} satisfies Messages["redactionCatalog"];
