/**
 * Tranche « redactionCatalog » du catalogue FR — la langue SOURCE. Générée depuis
 * `@openmasq/catalog/redaction` et `@openmasq/redact` (sections). `satisfies` par entrée.
 */
import type { Messages } from "../messages";

export const redactionCatalog = {
  categories: {
    name: {
      label: "Noms & prénoms",
      detail:
        "Prénoms, noms, identités complètes détectés par le modèle local — y compris en MAJUSCULES, collés ou dans un champ étiqueté (Nom :, Prénom(s) :). Les personnalités publiques restent lisibles.",
    },
    dob: {
      label: "Date de naissance",
      detail:
        "Dates de naissance (né le…, date of birth, formats FR/EN/DE), champs étiquetés inclus. Les autres dates ne sont jamais touchées.",
      impact:
        "Redacted, un âge ou un délai CALCULÉ par le modèle peut être décalé (la fausse date protège l'année réelle, elle-même identifiante). La date restituée, elle, est toujours la vraie.",
    },
    username: {
      label: "Pseudo / identifiant",
      detail: "Pseudos @handle et champs login / nom d'utilisateur / nickname.",
    },
    email: {
      label: "E-mail",
      detail:
        "Adresses e-mail (le faux garde un prénom cohérent pour que « Bonjour X » reste réversible).",
    },
    phone: {
      label: "Téléphone",
      detail:
        "Numéros français et internationaux (+33, 00…), validés libphonenumber pour l'international.",
    },
    address: {
      label: "Adresse postale",
      detail:
        "Adresses complètes multi-langues (FR/EN/DE/ES/IT/PT/NL + CJK) — remplacées par une vraie adresse du même pays, région différente.",
      impact:
        "Redacted, l'adresse reste cohérente (même pays, même forme) mais tout calcul géographique — distance, proximité, secteur — porte sur le lieu d'emprunt.",
    },
    location: {
      label: "Lieu / ville / code postal",
      detail:
        "Villes, codes postaux, départements, régions, lieux de naissance. Les PAYS ne sont jamais masqués (connaissance du monde).",
      impact:
        "Redacted, distances, trajets et juridictions sont raisonnés sur des lieux d'emprunt — cohérents entre eux, mais pas avec la carte réelle.",
    },
    company: {
      label: "Entreprise",
      detail:
        "Noms d'entreprises et d'organisations détectés par le modèle. Les grandes marques, produits et indices connus restent lisibles ; vos numéros SIREN/TVA relèvent d'« Identifiants d'entreprise ».",
      impact:
        "Redacted, le modèle ne sait RIEN de l'entreprise (secteur, taille, convention collective) : son nom d'emprunt est inconnu du monde, exprès.",
    },
    card: {
      label: "Carte bancaire",
      detail: "Numéros de carte 13-19 chiffres validés Luhn, espaces/tirets tolérés.",
    },
    iban: {
      label: "IBAN / coordonnées bancaires",
      detail:
        "IBAN (mod-97), BIC/SWIFT, et les codes de routage : ABA (US), sort code (UK), BSB (AU), CLABE (MX), IFSC (IN), numéros de compte étiquetés.",
    },
    national_id: {
      label: "ID national / passeport / permis",
      detail:
        "Documents d'identité de 40+ pays : CNI, passeports, NIR/sécu (espacé, Corse), permis de conduire, titres de séjour, numéros fiscaux, MRZ de documents scannés, SSN/ITIN, NHS, PESEL, AVS suisse, registre belge, CPF brésilien, carte d'identité chinoise, HKID, My Number… plus plaques d'immatriculation, VIN et IMEI. Sommes de contrôle vérifiées quand le pays en publie une.",
    },
    company_id: {
      label: "Identifiants d'entreprise",
      detail:
        "SIREN/SIRET/RCS, TVA intracommunautaire (FR + UE), LEI, registres du commerce (HR allemand, UEN Singapour, ABN/ACN Australie, CNPJ Brésil, EIN US), numéros d'organisation.",
    },
    ip: {
      label: "Adresse IP",
      detail:
        "IPv4, IPv6 (formes compressées ::) et adresses MAC — remplacées par des adresses valides.",
    },
    path: {
      label: "Chemins de fichiers",
      detail:
        "Chemins absolus (macOS/Windows/Linux), noms de fichiers et dossiers personnels (documents, images, archives) — le code source n'est pas visé.",
    },
    url: {
      label: "Adresses web (URL)",
      detail:
        "Masque l'adresse ENTIÈRE — domaine, chemin et paramètres — pas seulement ce qu'elle contient. Éteinte, les URL restent lisibles ET rien de ce qui se trouve à l'intérieur n'est masqué par erreur (noms de fichiers, jetons de cache d'une page consultée) ; les clés qui y figurent le sont toujours. Activée au niveau Strict, pensé pour l'analyse de documents.",
    },
    secret: {
      label: "Clés & secrets",
      detail:
        "Clés d'accès (OpenAI, AWS, Stripe, GitHub, Slack…), jetons de connexion, clés privées, mots de passe, codes OTP/PIN, portefeuilles crypto.",
    },
    apikey: {
      label: "Chaînes type clé (générique)",
      detail:
        "Heuristique large : toute chaîne qui RESSEMBLE à une clé (mélange lettres/chiffres long). Active à tous les niveaux de protection — une clé manquée part en clair. En contrepartie elle attrape aussi des références produit inoffensives.",
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
  allOn: "Tout activer",
  allOff: "Tout désactiver",
  reset: "Réinitialiser — hériter des réglages par défaut",
} satisfies Messages["redactionCatalog"];
