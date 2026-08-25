/**
 * Unified REDACTION-category catalog — the single source of truth for "which
 * redaction categories exist and how they're presented", shared by the desktop UI
 * and the org admin console.
 *
 * The category KEY vocabulary is `@openmasq/redact`'s `RedactionCategory` (the
 * engine's own enum) — re-exported here so there is ONE key type. The display
 * metadata (labels, groups, tones, defaults) previously lived in the UI-only file
 * `packages/ui/src/components/Settings/shared.ts`; it moves here so the admin can
 * govern the same categories the desktop enforces, with no drift.
 */
import {
  CATEGORY_HUE,
  CATEGORY_SECTION,
  REDACTION_SECTIONS,
  SECTION_HUE,
  type Hue,
  type RedactionCategory,
  type RedactionSection,
} from "@openmasq/redact";

export type { RedactionCategory };
// Re-export the palette's single source so a consumer (the desktop UI, the org admin
// console) colours a section or a category from it rather than declaring a second,
// drifting palette. `CATEGORY_HUE` is itself derived from `SECTION_HUE`.
export { CATEGORY_HUE, CATEGORY_SECTION, SECTION_HUE };
export type { Hue, RedactionSection };

// The `var(--hl-<hue>)` custom property behind a hue — the form every UI surface consumes.
const hlFg = (h: Hue): string => `var(--hl-${h})`;

/** Ordered display sections for the rules modal / admin policy grid. */
export const REDACTION_CATEGORY_GROUPS: string[] = [...REDACTION_SECTIONS];

/** One toggleable redaction category with its display metadata. */
export interface CatalogRedactionCategory {
  key: RedactionCategory;
  label: string;
  /** Its display section — from `CATEGORY_SECTION`, the palette's own grouping. */
  group: RedactionSection;
  /** Highlight colour as a `var(--hl-*)` CSS custom property. DERIVED from the category's
   *  section (`SECTION_HUE`), so a row on the rules screen is the colour the chat paints. */
  tone: string;
  /** True = only detected by the model engine (free-form PII) — UI nudges to enable. */
  ai?: boolean;
  /** User-facing FR summary of what the category ACTUALLY covers — surfaced in the
   *  rules modal and the docs so a short label never under-sells (or over-sells) the
   *  engine. Trust obligation (root rule 8): keep it accurate when rules change. */
  detail?: string;
  /** Ce que le redaction de cette catégorie peut FAUSSER dans la réponse — l'autre
   *  moitié de l'obligation de confiance (règle 8) : sur-vendre la fiabilité serait le
   *  même bug que sur-vendre la protection. Affiché là où l'on coche (matrice des
   *  règles). Chiffres et raisonnement : `packages/redact/bench/RAPPORT-risques-
   *  utilite-2026-07.md` — une DÉRIVATION n'est pas une clé de coffre. */
  impact?: string;
}

// Base list — keys, labels and copy only. The SECTION and the COLOUR are not repeated
// here: both are read from the palette source (`CATEGORY_SECTION` / `SECTION_HUE`) when
// `REDACTION_CATEGORIES` is built below, so a category cannot be filed under one section
// and painted with another's colour.
const BASE: { key: RedactionCategory; label: string; ai?: boolean; detail?: string; impact?: string }[] = [
  { key: "name", label: "Noms & prénoms", ai: true, detail: "Prénoms, noms, identités complètes détectés par le modèle local — y compris en MAJUSCULES, collés ou dans un champ étiqueté (Nom :, Prénom(s) :). Les personnalités publiques restent lisibles." },
  { key: "dob", label: "Date de naissance", ai: true, detail: "Dates de naissance (né le…, date of birth, formats FR/EN/DE), champs étiquetés inclus. Les autres dates ne sont jamais touchées.", impact: "Redacted, un âge ou un délai CALCULÉ par le modèle peut être décalé (la fausse date protège l'année réelle, elle-même identifiante). La date restituée, elle, est toujours la vraie." },
  // Pseudo / handle / login. DETERMINISTIC (labeled fields + a leading-`@` handle
  // rule — NOT `ai`), but a username is ambiguous so it defaults OFF (opt-in) via
  // OFF_BY_DEFAULT below, not the `ai` flag.
  { key: "username", label: "Pseudo / identifiant", detail: "Pseudos @handle et champs login / nom d'utilisateur / nickname." },
  { key: "email", label: "E-mail", detail: "Adresses e-mail (le faux garde un prénom cohérent pour que « Bonjour X » reste réversible)." },
  { key: "phone", label: "Téléphone", detail: "Numéros français et internationaux (+33, 00…), validés libphonenumber pour l'international." },
  { key: "address", label: "Adresse postale", ai: true, detail: "Adresses complètes multi-langues (FR/EN/DE/ES/IT/PT/NL + CJK) — remplacées par une vraie adresse du même pays, région différente.", impact: "Redacted, l'adresse reste cohérente (même pays, même forme) mais tout calcul géographique — distance, proximité, secteur — porte sur le lieu d'emprunt." },
  { key: "location", label: "Lieu / ville / code postal", ai: true, detail: "Villes, codes postaux, départements, régions, lieux de naissance. Les PAYS ne sont jamais masqués (connaissance du monde).", impact: "Redacted, distances, trajets et juridictions sont raisonnés sur des lieux d'emprunt — cohérents entre eux, mais pas avec la carte réelle." },
  { key: "company", label: "Entreprise", ai: true, detail: "Noms d'entreprises et d'organisations détectés par le modèle. Les grandes marques, produits et indices connus restent lisibles ; vos numéros SIREN/TVA relèvent d'« Identifiants d'entreprise ».", impact: "Redacted, le modèle ne sait RIEN de l'entreprise (secteur, taille, convention collective) : son nom d'emprunt est inconnu du monde, exprès." },
  { key: "card", label: "Carte bancaire", detail: "Numéros de carte 13-19 chiffres validés Luhn, espaces/tirets tolérés." },
  { key: "iban", label: "IBAN / coordonnées bancaires", detail: "IBAN (mod-97), BIC/SWIFT, et les codes de routage : ABA (US), sort code (UK), BSB (AU), CLABE (MX), IFSC (IN), numéros de compte étiquetés." },
  { key: "national_id", label: "ID national / passeport / permis", detail: "Documents d'identité de 40+ pays : CNI, passeports, NIR/sécu (espacé, Corse), permis de conduire, titres de séjour, numéros fiscaux, MRZ de documents scannés, SSN/ITIN, NHS, PESEL, AVS suisse, registre belge, CPF brésilien, carte d'identité chinoise, HKID, My Number… plus plaques d'immatriculation, VIN et IMEI. Sommes de contrôle vérifiées quand le pays en publie une." },
  { key: "company_id", label: "Identifiants d'entreprise", detail: "SIREN/SIRET/RCS, TVA intracommunautaire (FR + UE), LEI, registres du commerce (HR allemand, UEN Singapour, ABN/ACN Australie, CNPJ Brésil, EIN US), numéros d'organisation." },
  { key: "ip", label: "Adresse IP", detail: "IPv4, IPv6 (formes compressées ::) et adresses MAC — remplacées par des adresses valides." },
  { key: "path", label: "Chemins de fichiers", detail: "Chemins absolus (macOS/Windows/Linux), noms de fichiers et dossiers personnels (documents, images, archives) — le code source n'est pas visé." },
  // A GATE, not a value type: when ON the sub-parts of a URL are redacted like any
  // other text; when OFF (the default) NOTHING inside a URL is touched. A browsed /
  // searched page is full of image srcs + CDN cache-busters whose path/key/name
  // look-alikes flooded the audit ("détection de sous-parties d'URL, néfaste"), so
  // this defaults OFF to leave URLs alone.
  { key: "url", label: "Adresses web (URL)", detail: "Masque l'adresse ENTIÈRE — domaine, chemin et paramètres — pas seulement ce qu'elle contient. Éteinte, les URL restent lisibles ET rien de ce qui se trouve à l'intérieur n'est masqué par erreur (noms de fichiers, jetons de cache d'une page consultée) ; les clés qui y figurent le sont toujours. Activée au niveau Strict, pensé pour l'analyse de documents." },
  { key: "secret", label: "Clés & secrets", detail: "Clés d'accès (OpenAI, AWS, Stripe, GitHub, Slack…), jetons de connexion, clés privées, mots de passe, codes OTP/PIN, portefeuilles crypto." },
  { key: "apikey", label: "Chaînes type clé (générique)", detail: "Heuristique large : toute chaîne qui RESSEMBLE à une clé (mélange lettres/chiffres long). Active à tous les niveaux de protection — une clé manquée part en clair. En contrepartie elle attrape aussi des références produit inoffensives." },
];

/**
 * Per-SECTION swatch colour as a `var(--hl-*)` property — **DERIVED** from `SECTION_HUE`,
 * the palette's single source. This is the colour the "Règles de redaction" chips wear AND
 * the colour a redaction mark of that section wears in the chat, in a document and in the
 * privacy report: one value, one variable, no possible disagreement.
 *
 * It used to be a palette of its OWN, nine section-only colours declared here beside a
 * six-hue marker palette declared in the engine — which is how the rules screen came to
 * promise "e-mail is blue" while the chat painted it lime. Deriving is what makes that
 * class of bug unrepresentable; do not re-declare a colour here.
 */
export const REDACTION_GROUP_TONE: Record<string, string> = Object.fromEntries(
  REDACTION_SECTIONS.map((section) => [section, hlFg(SECTION_HUE[section])]),
);

/**
 * Categories the ENGINE still knows but the PRODUCT no longer exposes. They are absent
 * from `REDACTION_CATEGORIES` (no Settings toggle, no admin-policy row, not a valid
 * `forced_categories` id at the backend) and forced OFF in `CATEGORY_DEFAULTS`.
 *
 * A retired category is NOT the same as one that merely defaults off: an off-by-default
 * category can be switched back on, this one cannot. `effectiveRedactCategories`
 * (`packages/ui/src/send/redactionOptions.ts`) therefore forces them off at the send
 * merge — a `health: true` persisted before the retirement, or an org policy row written
 * against the old catalog, must not resurrect a category with no UI to turn it back off.
 */
export const RETIRED_CATEGORIES: readonly RedactionCategory[] = ["health", "number", "salary"];

/** The full catalogue of toggleable redaction categories. Section AND colour are read from
 *  the palette source, never declared beside the label. */
export const REDACTION_CATEGORIES: CatalogRedactionCategory[] = BASE.map((c) => ({
  ...c,
  group: CATEGORY_SECTION[c.key],
  tone: hlFg(CATEGORY_HUE[c.key]),
}));

/**
 * Default on/off policy per category, DERIVED from `BASE`:
 *  - **`ai` (BETA) categories default ON** — name/dob/address/location/company are the
 *    identity data the product's own copy promises to protect, and the default engine is
 *    the offline NER (`DEFAULT_SETTINGS.redactEngine: "local"`, bundled on the packaged
 *    desktop), so the promise holds out of the box. The "BETA" badge and the per-category
 *    toggles remain; a user who prefers no model-based redaction turns them off and their
 *    persisted choice wins over this seed (`normalizeSettings` spreads user settings over
 *    it). ⚠️ Where the AI engine is unavailable the send FAILS CLOSED by design — never
 *    "fix" that by flipping these back off silently.
 *  - **`apikey` (generic key-shaped strings) is now ON** — it is the one heuristic whose
 *    MISS is a credential in clear, so it belongs to the floor every level shares
 *    (`ALWAYS_ON`, `packages/ui/src/privacy/privacyLevel.ts`) rather than to the noise
 *    tier. The trade is accepted knowingly: the heuristic is broad and also catches
 *    harmless product references, which is exactly why it used to default OFF.
 *  - the remaining noise-tier heuristics (`url`, `username`) stay OFF — deliberately
 *    opt-in, and their absence is not a data risk the way a name or a key is.
 *  - every deterministic PII category (email/phone/card/iban/national_id/ip/path/
 *    secret) stays ON.
 *  - a RETIRED category is absent from `BASE`, hence OFF with no way back on.
 *
 * Keyed over the ENGINE's enum, not `BASE`, so the record stays total: consumers index it
 * by `RedactionCategory` and spread it as the seed for `Settings.redactCategories`.
 */
const OFF_BY_DEFAULT = new Set<RedactionCategory>(["url", "username"]);
export const CATEGORY_DEFAULTS: Record<RedactionCategory, boolean> = Object.fromEntries(
  (Object.keys(CATEGORY_HUE) as RedactionCategory[]).map((key) => {
    const c = BASE.find((b) => b.key === key);
    return [key, !!c && !OFF_BY_DEFAULT.has(key)];
  }),
) as Record<RedactionCategory, boolean>;
