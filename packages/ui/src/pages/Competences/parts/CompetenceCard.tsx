import type { KeyboardEvent, MouseEvent } from "react";
import type { Competence } from "../../../types";
import { competenceCategory } from "../../../competences/competences";
import { ArrowRightIcon, SendIcon } from "../../../components/brand";
import { ScopeBadge } from "../../../components/brand/ScopeBadge";

import { useT } from "../../../i18n";
/**
 * One compétence as a card (kit `SkillCard`). Pure presentation — every action is a
 * prop, so the page owns the store writes (components/ tier rules apply to page parts).
 *
 * The kit's interaction model: the CARD opens the editor; « Utiliser » is a real
 * button in the footer (with the send glyph), and the pin is a real button in the
 * header. Both stopPropagation so their activation never reaches the card, and
 * `onKeyDown` bails unless the key landed on the card ITSELF — otherwise Enter on
 * the pin would pin AND edit.
 *
 * The head therefore carries the pin ALONE: a second « modifier » button next to it
 * only repeated the card's own click target.
 */
export function CompetenceCard({
  competence,
  selected,
  onEdit,
  onUse,
  onTogglePin,
  scope,
  onShare,
}: {
  competence: Competence;
  /** The editor modal currently targets THIS card (kit: brand border + lime wash). */
  selected?: boolean;
  onEdit: () => void;
  onUse: () => void;
  /** Absent = no pin affordance (a SHARED card — pinning is a personal gesture). */
  onTogglePin?: () => void;
  /** Sharing scope badge (kit `SkillCard`): shown when an org exists. */
  scope?: string;
  /** Opens the « Partager » dialog for THIS compétence (personal cards only). */
  onShare?: () => void;
}) {
  const t = useT();
  const cat = competenceCategory(competence.cat);
  const uses = competence.uses ?? 0;
  const name = competence.name || "Sans titre";

  const onCardKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // a nested button owns this key
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onEdit();
  };
  const stop = (e: MouseEvent, run: () => void) => {
    e.stopPropagation();
    run();
  };

  return (
    <div
      className={`om-skill-card om-sweep-host om-step-in${selected ? " selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={t.lists.competences.editAria(name)}
      onClick={onEdit}
      onKeyDown={onCardKeyDown}
    >
      <div className="om-skill-card-head">
        {/* Category glyph + badge are NEUTRAL (monochrome) — the highlight hues stay
            the redaction's colour language, not category decoration. */}
        <span className="om-skill-glyph">{cat.glyph}</span>
        <span className="om-skill-cat">{cat.label}</span>
        {scope && <ScopeBadge scope={scope} />}
        <span className="om-skill-spacer" />
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
      </div>

      <div className="om-skill-body">
        <div className="om-skill-name">
          {/* Default (lime) sweep — the brand signature, no longer category-coloured. */}
          <span className="om-sweep">{name}</span>
        </div>
        {/* The description gets the room the mono prompt taste used to take (kit):
            what the user wrote about the compétence, three lines, then clipped. */}
        <div className="om-skill-desc clamp3">{competence.desc || "—"}</div>
      </div>

      <div className="om-skill-foot">
        <button
          type="button"
          className="om-skill-use"
          onClick={(e) => stop(e, onUse)}
          title={t.lists.competences.useTip}
          aria-label={t.lists.competences.useAria(name)}
        >
          <SendIcon size={13} /> <span className="om-sweep">{t.lists.competences.use}</span>
        </button>
        <span className="om-skill-spacer" />
        {onShare && (
          /* Promotion is what fills the shared scopes at all (kit) — revealed on
             hover by CSS so it does not compete with « Utiliser ». */
          <button
            type="button"
            className="om-skill-share"
            onClick={(e) => stop(e, onShare)}
            title={t.lists.competences.shareTip}
          >
            <ArrowRightIcon size={12} /> {t.lists.competences.share}
          </button>
        )}
        <span className="om-skill-uses">{uses}×</span>
      </div>
    </div>
  );
}
