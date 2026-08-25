import { NOTORIOUS_COMMERCIAL_ORGS, NOTORIOUS_PEOPLE } from "@openmasq/redact";
import { CATEGORY_DEFAULTS, REDACT_CATEGORIES } from "./redactCategories";
import type { RedactCategoryKey, Settings } from "../types";
import { BRAND } from "@openmasq/branding";

/**
 * The redaction rules, as ONE choice instead of seventeen.
 *
 * The settings screen used to open on the full category matrix — nine collapsible groups,
 * « 14/17 actives ». That number answers a question nobody asks: what a user decides is
 * how much they want protected, not which of seventeen detectors runs. So the page offers
 * three levels and keeps the matrix for the one who genuinely wants it.
 *
 * `custom` is not a preset — it is what we CALL any set that is neither of the other two,
 * so a user who has hand-tuned their categories never sees their choices silently renamed
 * (nor reset) by opening this screen.
 */
export type PrivacyLevel = "standard" | "renforce" | "strict" | "custom";

export const PRIVACY_LEVEL_META: {
  id: Exclude<PrivacyLevel, "custom">;
  label: string;
  desc: string;
  /** Ce niveau protège MOINS que les défauts d'installation : il ne porte PAS le bouclier
   *  (`PrivacyLevelPicker` lui met l'œil à la place) et ne peut pas être le défaut
   *  d'installation — voir le bloc ⚠️ ci-dessous. */
  reduced?: true;
  /**
   * Ce que le niveau COUVRE, en une phrase concrète — le registre COURT, pour une surface
   * où la décision se prend en passant (le menu du composeur). Il dit la même chose que
   * `desc` + `tradeoff` réunis, par l'autre bout : ce qui EST masqué, plutôt que l'usage
   * auquel le niveau convient et ce qu'il laisse lisible.
   *
   * ⚠️ Trois registres, UNE maison. Les Réglages gardent `desc` + `tradeoff` — c'est là que
   * la décision se prend en connaissance de cause, et la règle 8 y impose de dire ce que le
   * niveau coûte. Ce champ-ci ne les remplace pas : il évite qu'une seconde surface
   * réécrive les niveaux dans son coin, ce qui est exactement comme deux vocabulaires
   * naissent (règle 9).
   */
  short: string;
  /** La CONTREPARTIE du niveau, en une ligne — ce qu'il laisse lisible, ou ce que sa
   *  protection peut fausser dans la réponse. L'autre moitié de la règle 8 : sur-vendre
   *  la fiabilité serait le même bug que sur-vendre la protection. Chiffres :
   *  `packages/redact/bench/RAPPORT-risques-utilite-2026-07.md`. */
  tradeoff: string;
}[] = [
  // La description dit à quoi le niveau SERT, pas ce qu'il coche : le détail exact est
  // juste en dessous, dans la matrice — dépliée par défaut sur cette page, où les cinq
  // cases BETA décochées SONT ce que « Standard » laisse lisible.
  {
    id: "standard",
    label: "Standard",
    desc: "Parfait pour l'utilisation agentique du web.",
    short:
      "Le strict minimum sur vos données personnelles : e-mails, téléphones, cartes bancaires, IBAN, données de santé.",
    reduced: true,
    tradeoff: "Noms, dates, adresses, lieux et entreprises restent lisibles par le modèle.",
  },
  {
    id: "renforce",
    label: "Renforcé",
    desc: "Parfait pour l'utilisation agentique hors web.",
    short:
      "Va plus loin : ajoute les noms de personnes, d'entreprises et les identifiants que vous citez.",
    tradeoff:
      "Un âge ou une distance calculés sur une valeur masquée peuvent être décalés — le composeur le signale.",
  },
  {
    id: "strict",
    label: "Strict",
    desc: "Parfait pour l'analyse de documents.",
    short: `La totalité de ce que ${BRAND.name} sait détecter, sans exception.`,
    tradeoff: "Le modèle raisonne sur des valeurs fictives : calculs et réponses sur le monde réel peuvent être faux.",
  },
];

/**
 * ⚠️ « Standard » PROTÈGE MOINS QUE LES DÉFAUTS — et c'est le seul niveau dans ce cas.
 *
 * C'est le retour assumé de l'ancien preset « Navigation » : il laisse en clair les cinq
 * catégories BETA (noms, dates de naissance, adresses, lieux, entreprises), celles que
 * seul le modèle détecte. Ce preset avait été retiré parce que le moteur couvre déjà la
 * recherche web sans baisser la garde (le filtre de notoriété ne masque jamais une
 * personnalité, une grande marque ni un pays, et `WebNavRedactOffer` propose de révéler
 * le reste juste avant l'appel qui l'emporterait). Il revient sous condition, et les
 * conditions sont la contrepartie, pas de la décoration :
 *
 *  1. il porte `reduced: true` et NE PORTE PAS le bouclier — un bouclier à côté
 *     affirmerait la protection qu'il retire (règle 8 : une UI qui sur-vend le masquage
 *     est un bug de confiance). ⚠️ L'étiquette « protection réduite » qui l'accompagnait
 *     a été retirée : ce qui reste dit ce qu'il laisse lisible, c'est la MATRICE, dépliée
 *     par défaut sous les cartes (`Settings/privacy/PrivacyTab.tsx`). Si elle cessait de
 *     l'être, il faudrait rendre l'étiquette — sans quoi plus rien ne le signale ;
 *  2. il n'est PAS le défaut d'installation. `CATEGORY_DEFAULTS` vaut « Renforcé », donc
 *     personne n'y atterrit sans l'avoir choisi ;
 *  3. il respecte {@link ALWAYS_ON}, le plancher que TOUS les niveaux partagent.
 *
 * Ajouter un autre niveau réduit demande les trois, explicitement.
 */

/**
 * Le PLANCHER : les catégories qu'aucun niveau n'éteint, niveau réduit compris.
 *
 * `apikey` y est parce que son manque est d'une autre nature que celui d'un nom : une
 * chaîne en forme de clé qu'on laisse passer EST une clé en clair. L'heuristique est
 * large et attrape aussi des références produit inoffensives — c'est le prix, et il est
 * payé sciemment. L'utilisateur garde la main catégorie par catégorie (son choix devient
 * « Sur mesure », comme pour n'importe quelle autre) ; ce que ce plancher garantit, c'est
 * qu'aucun PRESET ne l'éteint dans son dos.
 */
export const ALWAYS_ON: readonly RedactCategoryKey[] = ["apikey", "secret"];

/** Les catégories BETA — détectées par le modèle seul. C'est EXACTEMENT ce que le niveau
 *  « Standard » laisse passer. Dérivé du catalogue (`ai`), jamais recopié : une nouvelle
 *  catégorie BETA rejoint la liste le jour où elle existe. */
const BETA_KEYS: RedactCategoryKey[] = REDACT_CATEGORIES.filter((c) => c.ai).map(
  (c) => c.key as RedactCategoryKey,
);

/** Every category key the UI can toggle. */
const ALL_KEYS = REDACT_CATEGORIES.map((c) => c.key as RedactCategoryKey);

/** The category map a level stands for. `custom` has none — it IS the absence of one. */
export function categoriesForLevel(level: Exclude<PrivacyLevel, "custom">): Settings["redactCategories"] {
  const out: Record<string, boolean> = {};
  for (const key of ALL_KEYS) {
    const on =
      level === "strict"
        ? true
        : level === "standard"
          ? CATEGORY_DEFAULTS[key] !== false && !BETA_KEYS.includes(key)
          : CATEGORY_DEFAULTS[key] !== false;
    // Le plancher passe EN DERNIER : aucun niveau ne peut l'éteindre, pas même le réduit.
    out[key] = on || ALWAYS_ON.includes(key);
  }
  return out as Settings["redactCategories"];
}

/**
 * Which level a saved category map amounts to. Compares the EFFECTIVE state (a missing
 * key means "default"), so a blob written before a category existed still reads as
 * Standard instead of jumping to « Sur mesure » on upgrade.
 *
 * Org-forced categories are excluded from the comparison: they are ON whatever the user
 * picked, so counting them would show « Sur mesure » to a member who never touched
 * anything — the screen would blame them for their admin's policy.
 */
export function levelOf(
  categories: Settings["redactCategories"] | undefined,
  forcedCategories?: readonly string[],
): PrivacyLevel {
  const forced = new Set(forcedCategories ?? []);
  const keys = ALL_KEYS.filter((k) => !forced.has(k));
  const on = (k: RedactCategoryKey) => (categories?.[k] ?? CATEGORY_DEFAULTS[k]) !== false;
  // Comparé aux maps que `categoriesForLevel` produit VRAIMENT, pas à une seconde
  // définition de chaque niveau : le round-trip est alors vrai par construction, et le
  // plancher n'a pas à être répété ici. Du plus protecteur au moins, pour qu'un niveau
  // qui en contient un autre ne le masque pas.
  for (const id of ["strict", "renforce", "standard"] as const) {
    const map = categoriesForLevel(id);
    if (keys.every((k) => on(k) === (map[k] !== false))) return id;
  }
  return "custom";
}

/** How many categories are actually protecting, org-forced ones included. */
/**
 * LA LISTE DE NOTORIÉTÉ : les personnalités publiques et les grandes entreprises —
 * intégrations MCP de l'app comprises, absolument (demande produit du 30/07/2026 ;
 * la parité avec le catalogue de connecteurs est épinglée par
 * `notorietyCatalogParity.test.ts`) — que tout niveau SAUF Strict ne redacted jamais.
 * Elle vit dans `@openmasq/redact` (`model/notoriousData.ts` — une seule maison,
 * règle 9) et est re-exportée ici pour que les écrans de réglages puissent la MONTRER
 * sans la recopier.
 */
export { NOTORIOUS_COMMERCIAL_ORGS, NOTORIOUS_PEOPLE };

/** Ce que le niveau accorde à la dispense de notoriété — les deux flags du moteur. */
export interface NotorietyPolicy {
  /** `commercialNotoriety` : grandes marques + intégrations MCP dispensées. */
  commercial: boolean;
  /** `peopleNotoriety` : personnalités publiques dispensées. */
  people: boolean;
}

/**
 * La dispense de notoriété du niveau — le store la passe à chaque appel moteur.
 *
 * **Strict redacted tout** : marques, intégrations MCP ET personnalités (« le modèle
 * raisonne sur des valeurs fictives » vaut aussi pour elles). **Tout autre niveau**
 * (Standard, Renforcé, Sur mesure) dispense les deux : une grande marque ou « Albert
 * Einstein » y sont de la connaissance générale — les redact fait répondre le
 * modèle sur une entreprise inventée ou sur personne. Ce que la dispense ne couvre
 * jamais, quel que soit le niveau : la porte « je travaille chez Google » du moteur
 * l'emporte (l'entité est publique, la RELATION de l'utilisateur non), et le scoping
 * par catégorie aussi (un particulier nommé Hermès/Leclerc reste protégé). Les pays
 * restent dispensés même en Strict (un pays redacted fait dériver la géographie).
 */
export function notorietyForLevel(level: PrivacyLevel): NotorietyPolicy {
  const strict = level === "strict";
  return { commercial: !strict, people: !strict };
}

/**
 * Combien de traits le glyphe de niveau porte : la protection, dessinée comme une quantité
 * (`components/brand` `LevelsIcon`). Standard 1, Renforcé 2, Strict 3.
 *
 * ⚠️ « Sur mesure » ne peut revendiquer AUCUN palier — c'est justement l'ensemble qui n'en
 * est aucun. Lui donner trois traits sur-vendrait la protection (règle 8 : une UI qui
 * sur-vend le masquage est un bug de confiance) ; lui en donner un la sous-vendrait tout
 * autant. On le déduit donc de ce qui est RÉELLEMENT actif, par tiers — la seule réponse qui
 * ne promette rien qu'on ne tienne pas.
 */
export function levelBars(
  level: PrivacyLevel,
  categories?: Settings["redactCategories"],
  forcedCategories?: readonly string[],
): 1 | 2 | 3 {
  if (level === "standard") return 1;
  if (level === "renforce") return 2;
  if (level === "strict") return 3;
  const ratio = activeCount(categories, forcedCategories) / (TOTAL_CATEGORIES || 1);
  return ratio >= 2 / 3 ? 3 : ratio >= 1 / 3 ? 2 : 1;
}

export function activeCount(
  categories: Settings["redactCategories"] | undefined,
  forcedCategories?: readonly string[],
): number {
  const forced = new Set(forcedCategories ?? []);
  return ALL_KEYS.filter((k) => forced.has(k) || (categories?.[k] ?? CATEGORY_DEFAULTS[k]) !== false).length;
}

export const TOTAL_CATEGORIES = ALL_KEYS.length;
