import { useEffect, useLayoutEffect, useMemo, useState, type KeyboardEvent, type RefObject } from "react";
import type { Messages } from "@openmasq/i18n";
import { usePopover } from "../../../hooks/usePopover";
import { useOpenSkill } from "../../../skills/skillOpen";
import type { Skill } from "../../../types";
import { useChatDoors } from "../chatGates";
import { clampSlashIndex, slashActionMatches, slashMatches, slashQuery, type SlashAction } from "../slashPalette";
import { placeSlashPalette, SLASH_MAX, type SlashPlacement } from "../slashPlacement";

interface Deps {
  input: string;
  onInput: (v: string) => void;
  onPickSkill?: (c: Skill) => void;
  skills?: Skill[];
  taRef: RefObject<HTMLTextAreaElement | null>;
  t: Messages;
}

/**
 * The compétence PALETTE: ONE instance, two openers. "/" at the start of the draft opens it
 * filtered, with the built-in actions (they REWRITE the draft); « + » → Compétence opens the
 * whole list, without them. The textarea keeps the focus, so both share the keyboard cursor.
 * Escape DISMISSES a "/" lookup until the draft moves on, but only CLOSES the « + » palette —
 * dismissing it would swallow the next "/" typed into an empty box.
 */
export function useSlashPalette(d: Deps) {
  const { input, onInput, onPickSkill, skills, taRef, t } = d;
  const palette = usePopover<HTMLDivElement, HTMLDivElement>();
  const inputWrapRef = palette.triggerRef;
  const [slashPlace, setSlashPlace] = useState<SlashPlacement>({ below: false, maxHeight: SLASH_MAX });
  const openSkillPage = useOpenSkill();
  const [slashIdx, setSlashIdx] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  // With ZERO compétences the palette still lists the built-in actions, so "/" is never a dead key.
  const slashQ = onPickSkill && !slashDismissed ? slashQuery(input) : null;
  const paletteQ = slashQ ?? (palette.open ? "" : null);
  const { skillsUsable, memoryOpen } = useChatDoors();
  const slashItems = useMemo(
    () => (paletteQ === null || !skillsUsable ? null : slashMatches(skills ?? [], paletteQ)),
    [paletteQ, skills, skillsUsable],
  );
  // Actions THEN compétences, one keyboard list.
  const slashActs = useMemo(() => (slashQ === null ? null : slashActionMatches(slashQ, t, memoryOpen)), [slashQ, t, memoryOpen]);
  const slashActCount = slashActs?.length ?? 0;
  const slashItemCount = slashItems?.length ?? 0;
  const slashCount = slashActCount + slashItemCount;
  // Opened from « + » it shows even empty: that empty state is where the feature is discovered.
  const paletteOpen = paletteQ !== null && (slashCount > 0 || palette.open);
  useEffect(() => {
    if (slashQuery(input) === null) setSlashDismissed(false);
  }, [input]);
  useEffect(() => {
    setSlashIdx(0);
  }, [paletteQ]);
  // Opened from « + », typing closes it — unless the draft became a "/" lookup.
  const closePalette = palette.close;
  useEffect(() => {
    closePalette();
  }, [input, closePalette]);

  const pickSlash = (c: Skill) => {
    // The "/query" draft is consumed; a real draft under the « + » palette stays.
    if (slashQ !== null) onInput("");
    closePalette();
    onPickSkill?.(c);
  };
  const pickSlashAction = (a: SlashAction) => {
    onInput(a.insert);
    taRef.current?.focus();
  };
  const pickSlashAt = (idx: number) => {
    if (slashActs && idx < slashActCount) pickSlashAction(slashActs[idx]);
    else if (idx < slashActCount + slashItemCount && slashItems) pickSlash(slashItems[idx - slashActCount]);
  };

  /** The palette owns the keys while it has matches; returns true when it consumed the key. */
  const onKeyDown = (e: KeyboardEvent): boolean => {
    if (slashCount === 0) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setSlashIdx((i) => clampSlashIndex(i + (e.key === "ArrowDown" ? 1 : -1), slashCount));
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (slashQ !== null) setSlashDismissed(true);
      closePalette();
      return true;
    }
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
      e.preventDefault();
      pickSlashAt(clampSlashIndex(slashIdx, slashCount));
      return true;
    }
    return false;
  };

  // The room on BOTH sides — the window AND the clipping ancestor (`.welcome` scrolls).
  // Layout effect: painted in the same commit, or it appears in the wrong place for a frame.
  useLayoutEffect(() => {
    const el = inputWrapRef.current;
    if (!paletteOpen || !el) return;
    const r = el.getBoundingClientRect();
    let topLimit = 0;
    let bottomLimit = window.innerHeight;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if (o === "auto" || o === "scroll" || o === "hidden") {
        const pr = p.getBoundingClientRect();
        topLimit = Math.max(topLimit, pr.top);
        bottomLimit = Math.min(bottomLimit, pr.bottom);
      }
    }
    setSlashPlace(placeSlashPalette(r.top - topLimit, bottomLimit - r.bottom));
  }, [paletteOpen, slashCount, inputWrapRef]);

  const openFromPlus =
    skillsUsable && onPickSkill && skills
      ? () => {
          palette.setOpen(true);
          taRef.current?.focus();
        }
      : undefined;
  const onCreate = openSkillPage
    ? () => {
        closePalette();
        openSkillPage("");
      }
    : undefined;

  return {
    menuRef: palette.menuRef,
    inputWrapRef,
    slashPlace,
    paletteOpen,
    slashItems,
    slashActs,
    activeIndex: clampSlashIndex(slashIdx, slashCount),
    pickSlash,
    pickSlashAction,
    onKeyDown,
    openFromPlus,
    onCreate,
  };
}

