import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../../i18n";
import { CheckIcon, IconButton, LevelsIcon } from "../../components/brand";
import { usePopover } from "../../hooks/usePopover";
import { privacyLevelLabel } from "../../privacy/privacyLevel";
import {
  ComposerRedactMenu,
  type AppliedChange,
  type LevelScope,
  type RedactLevelApi,
} from "./ComposerRedactMenu";

/** How long the confirmation pill (and its « Annuler ») stays on screen. */
export const APPLIED_PILL_MS = 6000;

/**
 * The action row's « niveau de masquage » button, its popover, and the confirmation
 * that follows a click.
 *
 * Kept apart from `Composer` (already in size debt) because it is a whole control —
 * trigger, anchoring, portal, feedback — and it needs nothing but its api.
 *
 * ⚠️ **PORTALLED and anchored, never `absolute`.** That is the warning `HueSelect` already
 * carries, and it holds here for two reasons measured in the built app: the composer lives
 * inside ancestors with `overflow`, which CLIP an in-flow menu; and the three cards — with
 * the counterpart rule 8 imposes on each — are taller than the room above the composer on
 * the welcome screen, so that in `absolute` the top of the menu left the window, taking the
 * heading and the first card with it. `clampHeight` bounds to the REAL room, and
 * `usePopover` flips the menu below the button when it must.
 *
 * **The tooltip names the level AND its scope** (« Renforcé · cette conversation »): three
 * strokes between a model picker and a counter read as a drag handle to anyone who has not
 * opened them yet, and an icon-only control whose value is a secret is a control one avoids.
 *
 * **A click is acknowledged, and it can be taken back.** The menu closes on apply, so the
 * only trace used to be one bolder stroke. The pill says what was set, where, and carries
 * « Annuler » for {@link APPLIED_PILL_MS} — the undo goes through the CURRENT api's `restore`,
 * so it spreads the live settings rather than the ones captured at the click.
 */
export function ComposerRedactButton({ api }: { api: RedactLevelApi }) {
  const t = useT();
  const pop = usePopover<HTMLDivElement, HTMLDivElement>({
    anchor: { gap: 8, width: 336, desiredHeight: 400, clampHeight: true, minHeight: 220 },
  });
  const [applied, setApplied] = useState<AppliedChange | null>(null);
  useEffect(() => {
    if (!applied) return;
    const id = setTimeout(() => setApplied(null), APPLIED_PILL_MS);
    return () => clearTimeout(id);
  }, [applied]);

  const scopeWord = (s: LevelScope) =>
    s === "conversation" ? t.composer.scopeShortConversation : t.composer.scopeShortDefault;
  const tip = t.composer.redactLevelTip(
    privacyLevelLabel(t, api.level),
    scopeWord(api.onApplyConversation ? "conversation" : "default"),
  );

  return (
    <div className="composer-redact-wrap" ref={pop.triggerRef}>
      <IconButton
        size="sm"
        label={tip}
        active={pop.open}
        expanded={pop.open}
        haspopup="dialog"
        onClick={pop.toggle}
      >
        <LevelsIcon size={16} bars={api.bars} />
      </IconButton>
      {applied && (
        <span className="crm-applied kx-pill-in" role="status">
          <CheckIcon size={12} />
          <span>
            {t.composer.applied(privacyLevelLabel(t, applied.level), scopeWord(applied.scope))}
          </span>
          <button
            type="button"
            className="crm-applied-undo"
            onClick={() => {
              api.restore(applied.snap);
              setApplied(null);
            }}
          >
            {t.composer.undo}
          </button>
        </span>
      )}
      {pop.open &&
        pop.style &&
        createPortal(
          <div
            ref={pop.menuRef}
            className="crm-pop"
            role="dialog"
            aria-label={t.composer.redactLevel}
            style={pop.style}
          >
            <ComposerRedactMenu
              api={api}
              onDone={(change) => {
                pop.close();
                if (change) setApplied(change);
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
