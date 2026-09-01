import { createPortal } from "react-dom";
import { useT } from "../../i18n";
import { IconButton, LevelsIcon } from "../../components/brand";
import { usePopover } from "../../hooks/usePopover";
import { ComposerRedactMenu, type RedactLevelApi } from "./ComposerRedactMenu";

/**
 * The action row's « niveau de redaction » button, and its popover.
 *
 * Kept apart from `Composer` (already in size debt) because it is a whole control —
 * trigger, anchoring, portal — and it needs nothing but its api.
 *
 * ⚠️ **PORTALLED and anchored, never `absolute`.** That is the warning `HueSelect` already
 * carries, and it holds here for two reasons measured in the built app: the composer lives
 * inside ancestors with `overflow`, which CLIP an in-flow menu; and the three cards — with
 * the counterpart rule 8 imposes on each — are taller than the room above the composer on
 * the welcome screen, so that in `absolute` the top of the menu left the window, taking the
 * heading and the first card with it. `clampHeight` bounds to the REAL room, and
 * `usePopover` flips the menu below the button when it must.
 */
export function ComposerRedactButton({ api }: { api: RedactLevelApi }) {
  const t = useT();
  const pop = usePopover<HTMLDivElement, HTMLDivElement>({
    anchor: { gap: 8, width: 386, desiredHeight: 280, clampHeight: true, minHeight: 180 },
  });
  return (
    <div className="composer-redact-wrap" ref={pop.triggerRef}>
      <IconButton
        size="sm"
        label={t.composer.redactLevel}
        active={pop.open}
        expanded={pop.open}
        haspopup="menu"
        onClick={pop.toggle}
      >
        <LevelsIcon size={16} bars={api.bars} />
      </IconButton>
      {pop.open &&
        pop.style &&
        createPortal(
          <div ref={pop.menuRef} className="crm-pop" style={pop.style}>
            <ComposerRedactMenu api={api} onDone={pop.close} />
          </div>,
          document.body,
        )}
    </div>
  );
}
