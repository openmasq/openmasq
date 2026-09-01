import type { KeyboardEvent, MouseEvent } from "react";
import type { Skill } from "../../../types";
import { skillCategory } from "../../../skills/skills";
import { ArrowRightIcon, SendIcon } from "../../../components/brand";
import { ScopeBadge } from "../../../components/brand/ScopeBadge";

import { useT } from "../../../i18n";
/**
 * A skill as a ROW — the same as `CompetenceCard`, dense.
 *
 * What stays and what goes, and why: the name, the category and « Utiliser » stay (that
 * is what one comes for); the description drops to ONE line instead of three — in a row,
 * the third line costs the density gain one came for.
 *
 * The same two interaction rules as the card, for the same reason: nested buttons stop
 * propagation, and the keyboard triggers the edit ONLY if the key landed on the row
 * itself. Without that, Enter on the pin would pin AND open the editor.
 */
export function SkillRow({
  skill,
  selected,
  onEdit,
  onUse,
  onTogglePin,
  scope,
  onShare,
}: {
  skill: Skill;
  selected?: boolean;
  onEdit: () => void;
  onUse: () => void;
  /** Absent = no pin affordance (a SHARED compétence — pinning is a personal
   *  ordering gesture, meaningless on someone else's copy). */
  onTogglePin?: () => void;
  /** Sharing scope badge (kit): shown when an org exists. */
  scope?: string;
  /** Opens the « Partager » dialog for THIS compétence (personal rows only). */
  onShare?: () => void;
}) {
  const t = useT();
  const cat = skillCategory(skill.cat, t);
  const name = skill.name || "Sans titre";
  const stop = (e: MouseEvent, run: () => void) => {
    e.stopPropagation();
    run();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onEdit();
  };

  return (
    <div
      className={`om-row${selected ? " is-selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={t.lists.skills.editAria(name)}
      onClick={onEdit}
      onKeyDown={onKeyDown}
    >
      <span className="om-row-mark" title={cat.label}>
        {cat.glyph}
      </span>
      <span className="om-row-main">
        <span className="om-row-name">{name}</span>
        <span className="om-row-sub">{skill.desc || cat.label}</span>
      </span>
      {scope && <ScopeBadge scope={scope} />}
      <span className="om-row-meta">{skill.uses ?? 0}×</span>
      <span className="om-row-actions">
        {onShare && (
          <button
            type="button"
            className="om-skill-share"
            onClick={(e) => stop(e, onShare)}
            title={t.lists.skills.shareTip}
          >
            <ArrowRightIcon size={12} /> Partager
          </button>
        )}
        {onTogglePin && (
          <button
            type="button"
            className={`om-skill-pin${skill.pinned ? " on" : ""}`}
            onClick={(e) => stop(e, onTogglePin)}
            aria-pressed={!!skill.pinned}
            title={skill.pinned ? t.lists.skills.unpin : t.lists.skills.pin}
          >
            {skill.pinned ? "★" : "☆"}
          </button>
        )}
        <button
          type="button"
          className="om-skill-use"
          onClick={(e) => stop(e, onUse)}
          title={t.lists.skills.useTip}
          aria-label={t.lists.skills.useAria(name)}
        >
          <SendIcon size={13} />
        </button>
      </span>
    </div>
  );
}
