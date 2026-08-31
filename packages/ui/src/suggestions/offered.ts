import type { Messages } from "@openmasq/i18n";
import type { Competence, CompetenceCategoryId } from "../types";
import { suggestedCompetences, type CompetenceSuggestion } from "./competenceSuggestions";
import { suggestedRoutines, type RoutineSuggestion } from "./routineSuggestions";

/**
 * CE QUE LA MODALE PROPOSE — une seule liste, depuis que les compétences et les
 * « workflows » n'en font qu'une.
 *
 * Les deux catalogues restent DEUX fichiers, et c'est voulu : ils n'ont pas les mêmes
 * règles de classement. Les prompts de prose se rangent par thème (les cinq catégories
 * sont entrelacées en tête, sans quoi un juriste ne voyait que de la rédaction) ; les
 * routines se rangent par ce qui est CONNECTÉ, avec une place réservée à une routine
 * dont rien n'est connecté — c'est par elle qu'on découvre une seconde intégration.
 * Fusionner les deux classements en un seul aurait perdu l'une des deux règles.
 *
 * Ce fichier ne fait donc que les mettre bout à bout, prose d'abord : la modale s'ouvre
 * sur ce qui marche sans rien brancher.
 */

export type AnyTemplate = CompetenceSuggestion | RoutineSuggestion;

/** Un modèle qui pilote des connecteurs — ce que l'app appelait un « workflow ».
 *  Le test porte sur le CHAMP, jamais sur une étiquette : c'est `servers` qui décide
 *  du comportement, donc c'est lui qui décide de la présentation. */
export function isRoutineTemplate(t: AnyTemplate): t is RoutineSuggestion {
  return Array.isArray((t as RoutineSuggestion).servers);
}

/** La catégorie qu'un modèle pré-remplit dans le formulaire de création. */
export function templateCategory(t: AnyTemplate): CompetenceCategoryId {
  return isRoutineTemplate(t) ? "routine" : t.cat;
}

/**
 * Les modèles à proposer à côté de ce que la personne a déjà. `connected` /
 * `unavailable` ne concernent que les routines (voir `suggestedRoutines`) ; `focus` est
 * géré par l'appelant, qui seul voit le brouillon en cours d'édition.
 */
export function offeredTemplates(
  existing: readonly Competence[],
  t: Messages,
  opts: {
    connected?: ReadonlySet<string>;
    unavailable?: ReadonlySet<string>;
    /** Combien de chacune des deux familles. */
    limit?: number;
  } = {},
): AnyTemplate[] {
  const { limit, connected, unavailable } = opts;
  return [
    ...suggestedCompetences(existing, t, limit),
    ...suggestedRoutines(existing, t, { connected, unavailable, limit }),
  ];
}
