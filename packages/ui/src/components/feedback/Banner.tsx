import { BANNER_ICONS, type BannerAction, type BannerTone } from "./bannerTones";

import { useT } from "../../i18n";
/**
 * Bottom feedback banner — the chat-app "kb" treatment. Full-bleed across the
 * app width, IN THE FLOW just above the composer (it pushes, never covers), with
 * a soft-tint semantic skin, a solid icon tile, a title + message, an optional
 * action button, and a close. Purely presentational; styling lives in styles.css
 * (`.kb` + `.kb--{tone}`).
 *
 * ⚠️ An app STATE notice (offline, connector down, access) is NOT this:
 * floating and permanent, this bar used to cover the whole bottom of the screen for one
 * sentence. Those notices go through `StatusChip`.
 */
export type { BannerAction, BannerTone };

export interface BannerProps {
  tone: BannerTone;
  title: string;
  message?: string;
  action?: BannerAction;
  onClose?: () => void;
}

export function Banner({ tone, title, message, action, onClose }: BannerProps) {
  const t = useT();
  return (
    // An error is interruptive news — `role="alert"` (assertive live region) — while
    // the other tones stay a polite `role="status"`.
    <div className={`kb kb--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span className="kb-ic">{BANNER_ICONS[tone]}</span>
      <div className="kb-body">
        <div className="kb-title">{title}</div>
        {message && <div className="kb-msg">{message}</div>}
      </div>
      {action && (
        <button
          className={`kb-act ${action.variant === "ghost" ? "ghost" : ""}`}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
      {onClose && (
        <button className="kb-x" aria-label={t.common.close} onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
