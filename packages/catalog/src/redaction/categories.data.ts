import type { RedactionCategory } from "@openmasq/redact";

/**
 * The category list — keys, labels and copy, and NOTHING else. Lifted out of the barrel so
 * that file stays a barrel (rule 1/2): a hundred and fifty lines of data between two export
 * statements is what pushed it over the cap.
 *
 * ⚠️ The SECTION and the COLOUR are deliberately absent. Both are read from the palette
 * source (`CATEGORY_SECTION` / `SECTION_HUE`) when `REDACTION_CATEGORIES` is built, so a
 * category cannot be filed under one section and painted with another's colour.
 */
export const BASE: {
  key: RedactionCategory;
  label: string;
  ai?: boolean;
  detail?: string;
  impact?: string;
}[] = [
  {
    key: "name",
    label: "Noms & prénoms",
    ai: true,
    detail:
      "Prénoms, noms, identités complètes détectés par le modèle local — y compris en MAJUSCULES, collés ou dans un champ étiqueté (Nom :, Prénom(s) :). Les personnalités publiques restent lisibles.",
  },
  {
    key: "dob",
    label: "Date de naissance",
    ai: true,
    detail:
      "Dates de naissance (né le…, date of birth, formats FR/EN/DE), champs étiquetés inclus. Les autres dates relèvent de « Dates », éteinte par défaut.",
    impact:
      "Redacted, un âge ou un délai CALCULÉ par le modèle peut être décalé (la fausse date protège l'année réelle, elle-même identifiante). La date restituée, elle, est toujours la vraie.",
  },
  // Every OTHER date — off by default (a date is rarely an identity on its own, and a
  // masked timestamp corrupts every duration the model reasons about), on in Strict, where
  // a dated event in a document is treated as the quasi-identifier it can be.
  {
    key: "date",
    label: "Dates",
    detail:
      "Toutes les autres dates — en chiffres (12/05/2024, 2024-05-12) ou en lettres (12 mai 2024, May 12, 2024, mai 2024), dans les langues du produit. Éteinte par défaut ; le niveau Strict l'allume. Les années seules ne sont jamais touchées.",
    impact:
      "Masquées, les durées, délais et chronologies que le modèle calcule portent sur des dates d'emprunt : décalées de quelques années mais cohérentes entre elles, et toujours restituées vraies.",
  },
  // Pseudo / handle / login. DETERMINISTIC (labeled fields + a leading-`@` handle rule —
  // NOT `ai`), and ON from Renforcé: a handle is the single most reliable way to re-find
  // someone across services, so its miss is an identity leak, not the cosmetic noise the
  // opt-in tier is for. The rule stays narrow (an explicit login field, or a leading `@`),
  // which is what makes the default affordable.
  {
    key: "username",
    label: "Pseudo / identifiant",
    detail:
      "Pseudos @handle et champs login / nom d'utilisateur / nickname. Active par défaut : un pseudo suit une personne d'un service à l'autre.",
  },
  {
    key: "email",
    label: "E-mail",
    detail:
      "Adresses e-mail (le faux garde un prénom cohérent pour que « Bonjour X » reste réversible).",
  },
  {
    key: "phone",
    label: "Téléphone",
    detail:
      "Numéros français et internationaux (+33, 00…), validés libphonenumber pour l'international.",
  },
  {
    key: "address",
    label: "Adresse postale",
    ai: true,
    detail:
      "Adresses complètes multi-langues (FR/EN/DE/ES/IT/PT/NL + CJK) — remplacées par une vraie adresse du même pays, région différente.",
    impact:
      "Redacted, l'adresse reste cohérente (même pays, même forme) mais tout calcul géographique — distance, proximité, secteur — porte sur le lieu d'emprunt.",
  },
  {
    key: "location",
    label: "Lieu / ville / code postal",
    ai: true,
    detail:
      "Villes, codes postaux, départements, régions, lieux de naissance. Les PAYS ne sont jamais masqués (connaissance du monde).",
    impact:
      "Redacted, distances, trajets et juridictions sont raisonnés sur des lieux d'emprunt — cohérents entre eux, mais pas avec la carte réelle.",
  },
  {
    key: "company",
    label: "Entreprise",
    ai: true,
    detail:
      "Noms d'entreprises et d'organisations détectés par le modèle. Les grandes marques, produits et indices connus restent lisibles ; vos numéros SIREN/TVA relèvent d'« Identifiants d'entreprise ».",
    impact:
      "Redacted, le modèle ne sait RIEN de l'entreprise (secteur, taille, convention collective) : son nom d'emprunt est inconnu du monde, exprès.",
  },
  {
    key: "card",
    label: "Carte bancaire",
    detail: "Numéros de carte 13-19 chiffres validés Luhn, espaces/tirets tolérés.",
  },
  {
    key: "iban",
    label: "IBAN / coordonnées bancaires",
    detail:
      "IBAN (mod-97), BIC/SWIFT, et les codes de routage : ABA (US), sort code (UK), BSB (AU), CLABE (MX), IFSC (IN), numéros de compte étiquetés.",
  },
  {
    key: "national_id",
    label: "ID national / passeport / permis",
    detail:
      "Documents d'identité de 40+ pays : CNI, passeports, NIR/sécu (espacé, Corse), permis de conduire, titres de séjour, numéros fiscaux, MRZ de documents scannés, SSN/ITIN, NHS, PESEL, AVS suisse, registre belge, CPF brésilien, carte d'identité chinoise, HKID, My Number… plus plaques d'immatriculation, VIN et IMEI. Sommes de contrôle vérifiées quand le pays en publie une.",
  },
  {
    key: "company_id",
    label: "Identifiants d'entreprise",
    detail:
      "SIREN/SIRET/RCS, TVA intracommunautaire (FR + UE), LEI, registres du commerce (HR allemand, UEN Singapour, ABN/ACN Australie, CNPJ Brésil, EIN US), numéros d'organisation.",
  },
  {
    key: "ip",
    label: "Adresse IP",
    detail:
      "IPv4, IPv6 (formes compressées ::) et adresses MAC — remplacées par des adresses valides.",
  },
  {
    key: "path",
    label: "Chemins de fichiers",
    detail:
      "Chemins absolus (macOS/Windows/Linux), noms de fichiers et dossiers personnels (documents, images, archives) — le code source n'est pas visé.",
  },
  // A GATE, not a value type: when ON the sub-parts of a URL are redacted like any
  // other text; when OFF (the default) NOTHING inside a URL is touched. A browsed /
  // searched page is full of image srcs + CDN cache-busters whose path/key/name
  // look-alikes flooded the audit ("détection de sous-parties d'URL, néfaste"), so
  // this defaults OFF to leave URLs alone.
  {
    key: "url",
    label: "Adresses web (URL)",
    detail:
      "Masque l'adresse ENTIÈRE — domaine, chemin et paramètres — pas seulement ce qu'elle contient. Éteinte, les URL restent lisibles ET rien de ce qui se trouve à l'intérieur n'est masqué par erreur (noms de fichiers, jetons de cache d'une page consultée) ; les clés qui y figurent le sont toujours. Activée au niveau Strict, pensé pour l'analyse de documents.",
  },
  {
    key: "secret",
    label: "Clés & secrets",
    detail:
      "Clés d'accès (OpenAI, AWS, Stripe, GitHub, Slack…), jetons de connexion, clés privées, mots de passe, codes OTP/PIN, portefeuilles crypto.",
  },
  {
    key: "apikey",
    label: "Chaînes type clé (générique)",
    detail:
      "Heuristique large : toute chaîne qui RESSEMBLE à une clé (mélange lettres/chiffres long). Active à tous les niveaux de protection — une clé manquée part en clair. En contrepartie elle attrape aussi des références produit inoffensives.",
  },
];
