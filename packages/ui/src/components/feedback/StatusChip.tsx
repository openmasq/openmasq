import { useState } from "react";
import { BANNER_ICONS, type BannerAction, type BannerTone } from "./bannerTones";

import { useT } from "../../i18n";
/**
 * The STATUS chip — the standing notice, said in one word.
 *
 * An app state (offline, a connector needing reconnection, limited access) lasts: it
 * therefore can't cost a full-width bar at the bottom of the screen, which used to cover
 * the composer and the whole lower area for a sentence read once. Here:
 * the TITLE alone, in a chip the width of its text, and the message +
 * the action on click — collapsed by default. The tone reuses the `.kb--<tone>` skin
 * (a single tone→colour table in the product).
 *
 * Purely presentational: the dock that places it is `.kchip-dock` (styles/statusChip.css),
 * what it announces is decided by `containers/shell/shellNotice.ts`.
 */
export interface StatusChipProps {
  tone: BannerTone;
  title: string;
  message?: string;
  action?: BannerAction;
  /** Present ⇒ the chip closes for good. An OUTAGE doesn't have one. */
  onClose?: () => void;
}

export function StatusChip({ tone, title, message, action, onClose }: StatusChipProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const hasDetail = !!message || !!action;
  const head = (
    <>
      <span className="kchip-ic">{BANNER_ICONS[tone]}</span>
      <span className="kchip-label">{title}</span>
      {hasDetail && (
        <svg className="kchip-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m18 15-6-6-6 6" />
        </svg>
      )}
    </>
  );
  return (
    <div
      className={`kchip kb--${tone}${open ? " kchip-open" : ""}`}
      // Escape closes the detail — the chip stays, only its unfolding is transient.
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <div className="kchip-row">
        {hasDetail ? (
          <button
            type="button"
            className="kchip-head"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {head}
          </button>
        ) : (
          <div className="kchip-head">{head}</div>
        )}
        {onClose && (
          <button type="button" className="kchip-x" aria-label={t.leaves.hide} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      {open && hasDetail && (
        <div className="kchip-detail">
          {message && <p className="kchip-msg">{message}</p>}
          {action && (
            <button type="button" className="kchip-act" onClick={action.onClick}>
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
