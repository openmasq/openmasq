import { useEffect, type KeyboardEvent, type MouseEvent, type RefObject } from "react";

/** One segment of the mirror: plain text or a redaction mark (see `splitDetected`).
 *  `uncertain` = « à vérifier » — the mark wears a distinct (dashed) style so the user
 *  reviews it before sending; it stays redacted unless explicitly kept in clear. */
export interface HlSeg {
  text: string;
  mark?: boolean;
  off: number;
  hue?: string;
  uncertain?: boolean;
}

/**
 * The composer's EDITOR pair — a transparent-text mirror painting the live
 * redaction marks BEHIND a transparent-background textarea — extracted so the
 * inline chatbox and the long-text MODAL render the exact same thing (one drift
 * point: a style applied to one and not the other misaligns the marks).
 *
 * Two layouts via `grow`:
 *  - a number → the inline auto-grow (height follows content up to that many px,
 *    then the textarea scrolls and the mirror scroll-syncs);
 *  - `null` → the modal FILL layout (the pair stretches to its container; the CSS
 *    `.in-modal` modifier lifts the inline max-height).
 */
export function HighlightedTextarea({
  taRef,
  backdropRef,
  value,
  onChange,
  segments,
  placeholder,
  grow,
  onKeyDown,
  onMouseUp,
  onKeyUp,
}: {
  taRef: RefObject<HTMLTextAreaElement>;
  backdropRef: RefObject<HTMLDivElement>;
  value: string;
  onChange: (v: string) => void;
  segments: HlSeg[];
  placeholder?: string;
  /** Max auto-grow height in px, or `null` for the modal fill layout. */
  grow: number | null;
  onKeyDown?: (e: KeyboardEvent) => void;
  onMouseUp?: (e: MouseEvent) => void;
  onKeyUp?: (e: KeyboardEvent) => void;
}) {
  const syncScroll = () => {
    const ta = taRef.current;
    const bd = backdropRef.current;
    if (ta && bd) {
      bd.scrollTop = ta.scrollTop;
      bd.scrollLeft = ta.scrollLeft;
    }
  };

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    if (grow != null) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, grow) + "px";
    }
    syncScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, grow]);

  const modal = grow == null ? " in-modal" : "";
  return (
    <>
      <div className={`composer-highlight${modal}`} ref={backdropRef} aria-hidden="true">
        {segments.map((s) =>
          s.mark ? (
            <span
              key={s.off}
              className={`composer-mark hl-${s.hue ?? "amber"}${s.uncertain ? " mk-doubt" : ""}`}
            >
              {s.text}
            </span>
          ) : (
            <span key={s.off}>{s.text}</span>
          ),
        )}
      </div>
      <textarea
        ref={taRef}
        className={`composer-input${modal}`}
        placeholder={placeholder}
        value={value}
        rows={1}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onMouseUp={onMouseUp}
        onKeyUp={onKeyUp}
        onScroll={syncScroll}
      />
    </>
  );
}
