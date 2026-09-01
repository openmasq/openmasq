import { useCallback } from "react";
import { useChatSelector } from "../containers/providers/chatStore";
import { findExistingSkill, type ProposedSkill } from "./proposedSkill";

/**
 * Adopts what a `SkillCard` proposes.
 *
 * ⚠️ **There is no more routing.** This hook used to exist to choose between two
 * sibling lists from the block's `kind`; the two lists are now just one. The `kind`
 * therefore no longer decides a DESTINATION, only the category the compétence is
 * filed under — and the `servers`, as before, come from the block: they are what
 * decide it will drive connectors.
 *
 * The hook stays (rather than code in `ChatView`) for the repo's usual reason:
 * this view is frozen by the line-count cap, and adoption belongs to the proposal's
 * domain, the way `competences/competenceOpen.tsx` belongs to its own.
 *
 * Returns `true` once the entry has actually been created; the card then freezes its
 * button, and a refusal (empty name or prompt) lets the user try again.
 */
export function useAddProposedSkill(): (skill: ProposedSkill) => boolean {
  const addCompetence = useChatSelector((s) => s.addCompetence);
  const competences = useChatSelector((s) => s.competences);
  return useCallback(
    (skill: ProposedSkill) => {
      const { name, prompt } = skill;
      // IDEMPOTENT: an identical entry (name + prompt) already exists ⇒ the adoption is
      // already done — we answer "yes" without duplicating. This is the OPERATION half of
      // the anti-duplicate fix; the DISPLAY half is `useIsProposedSkillAdded`.
      if (findExistingSkill(competences, skill)) return true;
      const desc = skill.desc || undefined;
      const isRoutine = skill.kind === "workflow" || skill.servers.length > 0;
      return !!addCompetence?.({
        name,
        prompt,
        desc,
        // The block's `kind` files it, it no longer creates anything else. A compétence
        // that names connectors is a routine even if the model typed the other
        // label — it is the field that decides the behaviour, hence the filing.
        cat: isRoutine ? "routine" : skill.cat,
        servers: skill.servers,
      });
    },
    [addCompetence, competences],
  );
}

/** "Is this proposal ALREADY in the list?" — the card button's state,
 *  derived from data (survives the virtualized list's remount and reload). */
export function useIsProposedSkillAdded(): (skill: ProposedSkill) => boolean {
  const competences = useChatSelector((s) => s.competences);
  return useCallback(
    (skill: ProposedSkill) => !!findExistingSkill(competences, skill),
    [competences],
  );
}
