import { useState } from "react";
import { featureUsage, useFeatureAccess } from "../../state/billing/featureAccess";
import type { Skill } from "../../types";

/**
 * The governable GATES as the chat screen sees them, and the single
 * piece of state that depends on them — in a separate module because `ChatView` and `Composer`
 * both read them, and neither needs to know which of the three
 * features also cuts off its usage (`@openmasq/catalog` `flags.ts` says which).
 *
 * ⚠️ `memoryOpen` only governs AFFORDANCES — « Retenir », the starter, the proposal
 * card, « /retenir ». The Mémoire keeps injecting itself, being queryable and
 * extracting itself with the door closed: that's the product decision, pinned both ways
 * by `state/featureAccess.test.ts`. `skillsUsable`, itself, cuts for good.
 */
export interface ChatGates {
  /** Can Compétences be staged / suggested / adopted? */
  skillsUsable: boolean;
  /** Do the Mémoire's affordances display? (how it actually works does NOT
   *  depend on this.) */
  memoryOpen: boolean;
  /** The competence staged for the NEXT send: the ENTITY, never text —
   *  its prompt doesn't touch the draft, it joins the model payload at send time.
   *  `null` as soon as usage is closed, without erasing the state: reopening the door restores
   *  the staging as-is, and a flag flipping back and forth destroys nothing. */
  activeSkill: Skill | null;
  setActiveSkill: (c: Skill | null) => void;
}

/** The two gates alone — what `Composer` needs (the staged state
 *  belongs to `ChatView`, which takes `useChatGates` just below). */
export function useChatDoors(): Pick<ChatGates, "skillsUsable" | "memoryOpen"> {
  const access = useFeatureAccess();
  return { skillsUsable: featureUsage("competences"), memoryOpen: access.memory };
}

export function useChatGates(): ChatGates {
  const doors = useChatDoors();
  const [staged, setActiveSkill] = useState<Skill | null>(null);
  return {
    ...doors,
    activeSkill: doors.skillsUsable ? staged : null,
    setActiveSkill,
  };
}
