import { useEffect, type ReactNode } from "react";
import { BANNER_ICONS, type BannerTone } from "./bannerTones";

/**
 * THE toast — a TRANSIENT notice: it says one thing and leaves on its own.
 *
 * The three feedback surfaces, by how long they last (components/CLAUDE.md):
 *   • `Toast`      — passes: a confirmation (« Noté en mémoire »), a composer notice;
 *   • `StatusChip` — stays: an app STATE (offline, a connector down, limited access);
 *   • `ModalShell` — blocks: a decision the user must take.
 * Three ad-hoc toasts used to exist (one borrowing `.sel-menu`, one a full-width `.kb`
 * bar, one a card of its own); this is the one family they all render through.
 *
 * Placement: DOCKED above the composer by default, or ANCHORED at a viewport point
 * (`at` — where the selection was). Tone reuses the `.kb--<tone>` skin, so the
 * tone→colour table stays single. ONE optional action — « Annuler » is the canonical
 * one — and the timer keeps running under it: an undo that waits forever is a chip.
 */
export interface ToastProps {
  tone: BannerTone;
  /** The one sentence. */
  message: string;
  /** An optional bold lead before it (« Pièce jointe ignorée »). */
  title?: string;
  /** Replaces the tone's glyph (the Mémoire mark beside « Noté »). */
  icon?: ReactNode;
  /** Anchor at this viewport point (the bubble hangs ABOVE it); absent ⇒ docked. */
  at?: { x: number; y: number };
  /** ms before `onDone`. Defaults: 2400, or 5000 when there is an action to take. */
  duration?: number;
  /** The caller unmounts the toast here — it never hides itself in place. */
  onDone: () => void;
  action?: { label: string; onClick: () => void };
}

export function Toast({ tone, message, title, icon, at, duration, onDone, action }: ToastProps) {
  const ms = duration ?? (action ? 5000 : 2400);
  useEffect(() => {
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
    // The toast is one notice: re-arming on every render of the caller would let a
    // parent that re-renders on each streamed token keep it on screen forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms]);
  return (
    <div
      className={`om-toast kb--${tone} ${at ? "om-toast-at" : "om-toast-dock"}`}
      role="status"
      // Runtime-computed anchor (viewport coords) — the allowed inline case (root rule 6).
      style={at ? { left: at.x, top: at.y } : undefined}
    >
      <span className="om-toast-ic" aria-hidden="true">
        {icon ?? BANNER_ICONS[tone]}
      </span>
      <span>
        {title && <span className="om-toast-title">{title} — </span>}
        {message}
      </span>
      {action && (
        <button type="button" className="om-toast-act" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
