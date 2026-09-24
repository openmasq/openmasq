import { useEffect, useState } from "react";
import { shallowEqual, useChatSelector } from "../../../containers/providers/chatStore";
import { askTargetLabel, askTargetLaunchText } from "../../../send/askTarget";
import { promptSlots, skillLaunchText, skillServers } from "../../../skills/launch";
import { useOpenSkill } from "../../../skills/skillOpen";
import { useAddProposedSkill, useIsProposedSkillAdded } from "../../../suggestions/useAddProposedSkill";
import type { AskTarget, Skill } from "../../../types";
import { useChatGates } from "../chatGates";
import type { ChatViewProps, IntentTag } from "./types";

/**
 * The ONE intent chip a send carries: a compétence, a « Demander » target, or a
 * text-selection tag. The compétence and target chips are DERIVED from their staged
 * entity, never a second state — a clear that misses the entity would leave no visible
 * trace while the prompt still rides the next send. The chip's preview is the EXACT text
 * prepended to the payload, so it tells the whole truth about the send.
 */
export function useIntentChips(p: ChatViewProps) {
  const { pendingSkill, onSkillConsumed, pendingTarget, onTargetConsumed } = p;
  const { skillsUsable, memoryOpen, activeSkill, setActiveSkill } = useChatGates();
  const [activeTag, setActiveTag] = useState<IntentTag | null>(null);
  const [activeTarget, setActiveTarget] = useState<AskTarget | null>(null);
  const openSkill = useOpenSkill();
  const skills = useChatSelector((s) => s.skills, shallowEqual);
  const markSkillUsed = useChatSelector((s) => s.markSkillUsed);
  // Adopting what the model just produced (`SkillCard`) — the routing lives in the suggestion domain.
  const addProposedSkill = useAddProposedSkill();
  const isProposedSkillAdded = useIsProposedSkillAdded();

  // Picking replaces whatever intent was staged — a send carries at most one.
  const handlePickSkill = (c: Skill) => {
    setActiveSkill(c);
    setActiveTag(null);
    setActiveTarget(null);
    markSkillUsed?.(c.id);
  };

  // The shell's hand-offs stage the ENTITY the same way the composer's picker does; the
  // draft is never touched, so a half-typed message survives and the tag stays truthful.
  useEffect(() => {
    if (!pendingSkill) return;
    setActiveSkill(pendingSkill);
    setActiveTag(null);
    setActiveTarget(null);
    onSkillConsumed?.();
  }, [pendingSkill]);
  useEffect(() => {
    if (!pendingTarget) return;
    setActiveTarget(pendingTarget);
    setActiveTag(null);
    setActiveSkill(null);
    onTargetConsumed?.();
  }, [pendingTarget]);

  const drivesTools = !!activeSkill?.servers?.length;
  const skillTag: IntentTag | null = activeSkill
    ? {
        label: `${drivesTools ? "Routine" : "Compétence"} : ${activeSkill.name}`,
        tone: drivesTools ? "violet" : "sky",
        preview: skillLaunchText(activeSkill),
        servers: drivesTools ? skillServers(activeSkill) : undefined,
        // The prompt's `{braces}` are filled by nothing: showing them is what reminds the
        // user to specify them in the message beside the chip.
        slots: promptSlots(activeSkill.prompt),
      }
    : null;
  const targetTag: IntentTag | null = activeTarget
    ? {
        label: askTargetLabel(activeTarget),
        tone: "forest",
        glyph: activeTarget.kind,
        preview: askTargetLaunchText(activeTarget),
      }
    : null;

  const clearTag = () => {
    if (activeSkill) setActiveSkill(null);
    else if (activeTarget) setActiveTarget(null);
    else setActiveTag(null);
  };
  // A compétence chip is editable once the shell wired its provider; selection tags stay inert.
  const editTag = activeSkill && openSkill ? () => openSkill(activeSkill.id) : undefined;
  const resetAll = () => {
    setActiveTag(null);
    setActiveSkill(null);
    setActiveTarget(null);
  };

  return {
    skillsUsable,
    memoryOpen,
    skills,
    activeSkill,
    activeTarget,
    activeTag,
    setActiveTag,
    tag: skillTag ?? targetTag ?? activeTag,
    handlePickSkill,
    addProposedSkill,
    isProposedSkillAdded,
    clearTag,
    editTag,
    resetAll,
  };
}

export type IntentChipsApi = ReturnType<typeof useIntentChips>;
