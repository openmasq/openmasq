import type { KeyboardEvent, MouseEvent } from "react";
import type { Competence } from "../../../types";
import { competenceCategory } from "../../../competences/competences";
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
export function CompetenceRow({
  competence,
  selected,
  onEdit,
  onUse,
  onTogglePin,
  scope,
  onShare,
}: {
  competence: Competence;
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
  const cat = competenceCategory(competence.cat, t);
  const name = competence.name || "Sans titre";
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
      aria-label={t.lists.competences.editAria(name)}
      onClick={onEdit}
      onKeyDown={onKeyDown}
    >
      <span className="om-row-mark" title={cat.label}>
        {cat.glyph}
      </span>
      <span className="om-row-main">
        <span className="om-row-name">{name}</span>
        <span className="om-row-sub">{competence.desc || cat.label}</span>
      </span>
      {scope && <ScopeBadge scope={scope} />}
      <span className="om-row-meta">{competence.uses ?? 0}×</span>
      <span className="om-row-actions">
        {onShare && (
          <button
            type="button"
            className="om-skill-share"
            onClick={(e) => stop(e, onShare)}
            title={t.lists.competences.shareTip}
          >
            <ArrowRightIcon size={12} /> Partager
          </button>
        )}
        {onTogglePin && (
          <button
            type="button"
            className={`om-skill-pin${competence.pinned ? " on" : ""}`}
            onClick={(e) => stop(e, onTogglePin)}
            aria-pressed={!!competence.pinned}
            title={competence.pinned ? t.lists.competences.unpin : t.lists.competences.pin}
          >
            {competence.pinned ? "★" : "☆"}
          </button>
        )}
        <button
          type="button"
          className="om-skill-use"
          onClick={(e) => stop(e, onUse)}
          title={t.lists.competences.useTip}
          aria-label={t.lists.competences.useAria(name)}
        >
          <SendIcon size={13} />
        </button>
      </span>
    </div>
  );
}
