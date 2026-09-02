import { useEffect, useRef } from "react";
import { useT } from "../../i18n";
import type { Skill } from "../../types";
import type { SlashAction } from "./slashPalette";
import { MemoryIcon, WorkflowIcon } from "../../components/brand";

/**
 * The composer's compétence palette — ONE instance, two openers: "/" at the start of
 * the draft and « + » → Compétence (same list, same look, one home). Picking one
 * stages the compétence as a chip; both live in `ChatView` (`onPickSkill`). This is
 * pure presentation: it renders the list and reports the pick. The open state, the
 * outside-click/Escape close and the keyboard cursor live in `Composer`; the cursor
 * arrives as `activeIndex` (the textarea keeps focus — the menu never steals it, so
 * `aria-activedescendant`-style focus stays a non-problem).
 *
 * The "/" lookup also lists built-in ACTIONS (`slashPalette.SLASH_ACTIONS`, e.g.
 * « /retenir ») ABOVE the compétences; `activeIndex` spans actions THEN compétences
 * as one list. Opened from « + », no actions are passed (they rewrite the draft).
 * Chrome: `styles/skills/composer.css`.
 */
export function ComposerSkillMenu({
  skillList,
  onPick,
  activeIndex,
  onCreate,
  actions,
  onPickAction,
}: {
  skillList: Skill[];
  onPick: (c: Skill) => void;
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
  const t = useT();
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
          <div className="composer-skill-eyebrow">{t.menus.skills.actions}</div>
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
      <div className="composer-skill-eyebrow">{t.menus.skills.heading}</div>
      {skillList.length === 0 ? (
        <div className="composer-skill-empty">
          <span>{t.menus.skills.empty}</span>
          {onCreate && (
            <button type="button" className="composer-skill-create" onClick={onCreate}>
              {t.menus.skills.create}
            </button>
          )}
        </div>
      ) : (
        skillList.map((c, i) => (
          <button
            key={c.id}
            type="button"
            role="menuitem"
            data-idx={i + actionCount}
            className={`composer-skill-item${i + actionCount === activeIndex ? " active" : ""}`}
            onClick={() => onPick(c)}
            title={c.desc || c.name}
          >
            {/* The one that drives connectors wears the routines glyph. ONE list:
                the `servers` field distinguishes, never a second section (it split the
                keyboard cursor in two and made you look in the wrong place). */}
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
