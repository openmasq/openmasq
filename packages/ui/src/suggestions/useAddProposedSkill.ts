import { useCallback } from "react";
import { useChatSelector } from "../containers/providers/chatStore";
import { findExistingSkill, type ProposedSkill } from "./proposedSkill";

/**
 * Adopter ce qu'un `SkillCard` propose.
 *
 * ⚠️ **Il n'y a plus d'aiguillage.** Ce hook existait pour choisir entre deux listes
 * sœurs à partir du `kind` du bloc ; les deux listes n'en font plus qu'une. Le `kind`
 * ne décide donc plus d'une DESTINATION, seulement de la catégorie où la compétence est
 * rangée — et les `servers`, eux, viennent du bloc comme avant : ce sont eux qui font
 * qu'elle pilotera des connecteurs.
 *
 * Le hook reste (plutôt que du code dans `ChatView`) pour la raison habituelle du dépôt :
 * cette vue est gelée par le plafond de lignes, et l'adoption appartient au domaine de la
 * proposition, comme `competences/competenceOpen.tsx` appartient au sien.
 *
 * Rend `true` quand l'entrée a bien été créée ; la carte fige alors son bouton, et un
 * refus (nom ou prompt vide) laisse l'utilisateur réessayer.
 */
export function useAddProposedSkill(): (skill: ProposedSkill) => boolean {
  const addCompetence = useChatSelector((s) => s.addCompetence);
  const competences = useChatSelector((s) => s.competences);
  return useCallback(
    (skill: ProposedSkill) => {
      const { name, prompt } = skill;
      // IDEMPOTENT : une entrée identique (nom + prompt) existe déjà ⇒ l'adoption est
      // déjà faite — on répond « oui » sans dupliquer. C'est la moitié OPÉRATION du
      // correctif anti-doublon ; la moitié AFFICHAGE est `useIsProposedSkillAdded`.
      if (findExistingSkill(competences, skill)) return true;
      const desc = skill.desc || undefined;
      const isRoutine = skill.kind === "workflow" || skill.servers.length > 0;
      return !!addCompetence?.({
        name,
        prompt,
        desc,
        // Le `kind` du bloc range, il ne crée plus rien d'autre. Une compétence qui
        // nomme des connecteurs est une routine même si le modèle a tapé l'autre
        // étiquette — c'est le champ qui décide du comportement, donc du rangement.
        cat: isRoutine ? "routine" : skill.cat,
        servers: skill.servers,
      });
    },
    [addCompetence, competences],
  );
}

/** « Cette proposition est-elle DÉJÀ dans la liste ? » — l'état du bouton de la carte,
 *  dérivé des données (survit au remount de la liste virtualisée et au reload). */
export function useIsProposedSkillAdded(): (skill: ProposedSkill) => boolean {
  const competences = useChatSelector((s) => s.competences);
  return useCallback(
    (skill: ProposedSkill) => !!findExistingSkill(competences, skill),
    [competences],
  );
}
