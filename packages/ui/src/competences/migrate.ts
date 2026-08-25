import type { Competence } from "../types";

/**
 * LA REPRISE DE L'ANCIENNE LISTE « WORKFLOWS ».
 *
 * Les deux listes étaient le même objet au champ près ; il n'en reste qu'une. Ce fichier
 * est ce qui fait que personne ne s'en aperçoit en perdant quelque chose : au chargement
 * d'un blob de réglages écrit par une version d'avant, `Settings.workflows` est versé
 * dans `Settings.competences` puis effacé.
 *
 * Trois choses tiennent, et chacune casse quelque chose de visible si on l'oublie :
 *
 * 1. **Les ids sont conservés.** Un chip de compositeur, un lien profond, un tag de
 *    message et un `uses` pointent dessus ; en frapper de nouveaux transformerait tout
 *    l'historique en références mortes.
 * 2. **L'ordre**, compétences d'abord puis routines, et le tri par date reste au
 *    rendu — une liste qui se réordonne toute seule au premier lancement se lit comme
 *    une perte de données.
 * 3. **Idempotent PAR RÉFÉRENCE.** Sans rien à reprendre, la MÊME liste revient, donc le
 *    chargement n'écrit pas d'état et ne relance pas la persistance en boucle.
 */

/** La catégorie où atterrit un ex-workflow : le mot que les gens avaient, descendu d'une
 *  section à une catégorie (`COMPETENCE_CATEGORIES`). */
const ROUTINE_CAT = "routine" as const;

/** Normalise une entrée de l'ancienne liste en compétence. Un workflow n'avait pas de
 *  catégorie — il devient une « Routine ». Sa liste de connecteurs est gardée telle
 *  quelle : c'est elle qui portait tout le comportement, et une liste vide s'efface pour
 *  que le champ reste le test de « pilote des outils ». */
export function workflowToCompetence(wf: Competence): Competence {
  const servers = [...new Set(wf.servers ?? [])];
  const { servers: _drop, ...rest } = wf;
  return {
    ...rest,
    cat: wf.cat ?? ROUTINE_CAT,
    ...(servers.length ? { servers } : {}),
  };
}

/**
 * Fusionne l'ancienne liste dans la nouvelle. Une entrée dont l'id est DÉJÀ présent est
 * ignorée (une reprise rejouée, un blob synchronisé qui porte les deux) — sans quoi
 * rouvrir l'app dupliquerait la liste à chaque fois.
 *
 * Renvoie `null` quand il n'y a rien à faire, pour que l'appelant puisse ne pas écrire.
 */
export function mergeLegacyWorkflows(
  competences: readonly Competence[] | undefined,
  workflows: readonly Competence[] | undefined,
): Competence[] | null {
  if (!workflows?.length) return null;
  const seen = new Set((competences ?? []).map((c) => c.id));
  const migrated = workflows.filter((w) => w?.id && !seen.has(w.id)).map(workflowToCompetence);
  if (!migrated.length) return null;
  return [...(competences ?? []), ...migrated];
}
