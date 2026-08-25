import { useEffect, useRef } from "react";
import type { Competence } from "../../types";
import type { SlashAction } from "./slashPalette";
import { MemoryIcon, WorkflowIcon } from "../../components/brand";

/**
 * The composer's compétence picker menu — shared by the ✨ button's dropdown AND the
 * "/" palette (same list, same look, one home). Picking one stages the compétence as
 * a chip; both live in `ChatView` (`onPickCompetence`). This is pure presentation:
 * it renders the list and reports the pick. The button that toggles it + the
 * outside-click/Escape close live in `Composer` (which owns the wrapper ref), and the
 * palette's keyboard cursor arrives as `activeIndex` (the textarea keeps focus — the
 * menu never steals it, so `aria-activedescendant`-style focus stays a non-problem).
 *
 * The "/" palette also lists built-in ACTIONS (`slashPalette.SLASH_ACTIONS`, e.g.
 * « /retenir ») ABOVE the compétences; `activeIndex` spans actions THEN compétences
 * as one list. The ✨ dropdown passes no actions. Chrome: `styles/skills/composer.css`.
 */
export function ComposerSkillMenu({
  competences,
  onPick,
  activeIndex,
  onCreate,
  actions,
  onPickAction,
}: {
  competences: Competence[];
  onPick: (c: Competence) => void;
  /** The "/" palette's keyboard cursor — highlights that row and keeps it scrolled
   *  into view. Absent for the ✨ dropdown (mouse-only). */
  activeIndex?: number;
  /** Open the Compétences page to create the first one — the empty state's CTA.
   *  Absent ⇒ plain text (no navigation path wired). */
  onCreate?: () => void;
  /** Built-in palette actions, listed FIRST (index 0..n-1; compétences follow). */
  actions?: SlashAction[];
  onPickAction?: (a: SlashAction) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const actionCount = actions?.length ?? 0;

  // Keep the keyboard cursor visible as it moves through an overflowing list.
  useEffect(() => {
    if (activeIndex === undefined) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="composer-skill-menu" role="menu" ref={listRef}>
      {actions && actions.length > 0 && (
        <>
          <div className="composer-skill-eyebrow">Actions</div>
          {actions.map((a, i) => (
            <button
              key={a.id}
              type="button"
              role="menuitem"
              data-idx={i}
              className={`composer-skill-item${i === activeIndex ? " active" : ""}`}
              onClick={() => onPickAction?.(a)}
              title={a.desc}
            >
              <span className="composer-skill-action-ico">
                <MemoryIcon size={14} />
              </span>
              <span className="composer-skill-texts">
                <span className="composer-skill-name">{a.label}</span>
                <span className="composer-skill-desc">{a.desc}</span>
              </span>
            </button>
          ))}
        </>
      )}
      <div className="composer-skill-eyebrow">Compétences</div>
      {competences.length === 0 ? (
        <div className="composer-skill-empty">
          <span>Aucune compétence — vos prompts réutilisables, insérés en un clic.</span>
          {onCreate && (
            <button type="button" className="composer-skill-create" onClick={onCreate}>
              Créer une compétence
            </button>
          )}
        </div>
      ) : (
        competences.map((c, i) => (
          <button
            key={c.id}
            type="button"
            role="menuitem"
            data-idx={i + actionCount}
            className={`composer-skill-item${i + actionCount === activeIndex ? " active" : ""}`}
            onClick={() => onPick(c)}
            title={c.desc || c.name}
          >
            {/* Celle qui pilote des connecteurs porte le glyphe des routines. UNE liste :
                le champ `servers` distingue, jamais une seconde section (elle coupait le
                curseur clavier en deux et faisait chercher au mauvais endroit). */}
            {c.servers?.length ? (
              <span className="composer-skill-action-ico composer-skill-wf-ico">
                <WorkflowIcon size={14} />
              </span>
            ) : (
              <span className="composer-skill-dot" />
            )}
            <span className="composer-skill-texts">
              <span className="composer-skill-name">{c.name}</span>
              {c.desc && <span className="composer-skill-desc">{c.desc}</span>}
            </span>
          </button>
        ))
      )}
    </div>
  );
}
