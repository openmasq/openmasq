import { useEffect, useRef, useState, type RefObject } from "react";

/** One hovered/tapped redaction mark, read straight off its `data-*` attributes. */
export interface HoveredMark {
  real: string;
  fake: string;
  tone: string;
  kind: string;
  rect: DOMRect;
}

/**
 * The hover/tap plumbing behind `RedactionInlineReveal` — which mark is active, on which
 * presentation, and when it goes away. Everything here is DELEGATED on the container root
 * (one pair of listeners, never per-mark) so it works identically for React marks,
 * Markdown marks and the PDF/cell overlay boxes.
 *
 * Two presentations, decided ONCE per mount by the `.app-mobile` ancestor:
 *  - desktop: mouseover/out drive an anchored popover; it flips BELOW near the viewport
 *    top, stays open while the pointer is over the mark OR the popover, and dismisses on
 *    scroll (a `fixed` card would drift away from its mark);
 *  - mobile (`sheetMode`): iOS synthesizes mouseover on tap (which would double-open),
 *    so the menu is TAP-driven and presents as a bottom sheet. `hov` is cleared only
 *    AFTER the slide-out (360 ms) so the content doesn't vanish mid-animation.
 */
export function useMarkHover(containerRef: RefObject<HTMLElement | null>, selector: string) {
  const [hov, setHov] = useState<HoveredMark | null>(null);
  const [below, setBelow] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetMode = useRef(false);
  const markRef = useRef<HTMLElement | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  };
  const close = () => {
    cancelHide();
    markRef.current = null;
    if (sheetMode.current) {
      setSheetOpen(false);
      hideTimer.current = setTimeout(() => setHov(null), 360);
    } else {
      setHov(null);
    }
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = setTimeout(close, 140);
  };

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const readMark = (mark: HTMLElement): HoveredMark => ({
      real: mark.dataset.real ?? "",
      fake: mark.dataset.fake ?? "",
      tone: mark.dataset.tone || "slate",
      kind: mark.dataset.kind ?? "",
      rect: mark.getBoundingClientRect(),
    });
    if (root.closest(".app-mobile")) {
      sheetMode.current = true;
      const onClick = (e: Event) => {
        const mark = (e.target as HTMLElement).closest?.(selector) as HTMLElement | null;
        if (!mark) return;
        e.stopPropagation();
        cancelHide();
        markRef.current = mark;
        setHov(readMark(mark));
        setSheetOpen(true);
      };
      root.addEventListener("click", onClick);
      return () => {
        cancelHide();
        root.removeEventListener("click", onClick);
      };
    }
    sheetMode.current = false;
    const openOn = (mark: HTMLElement) => {
      cancelHide();
      if (mark === markRef.current) return; // same mark (bubbled) → don't re-render
      markRef.current = mark;
      const rect = mark.getBoundingClientRect();
      setBelow(rect.top < 170); // kit: flip under the mark near the viewport top
      setHov(readMark(mark));
    };
    const onOver = (e: Event) => {
      const mark = (e.target as HTMLElement).closest?.(selector) as HTMLElement | null;
      if (mark) openOn(mark);
    };
    // Inspect ≠ reveal (audit 2026-08-10): the CLICK (and Enter on a mark-button,
    // the only KEYBOARD path to the card) PINS the card — same actions as
    // hover — instead of toggling the reveal. The exploration gesture (« qu'y a-t-il
    // dessous ? ») must never be the one that changes what leaves the machine;
    // « Démasquer » is the card's explicit action. `stopPropagation` neutralizes
    // any residual onClick from a mark (parity with the mobile branch above).
    const onClick = (e: Event) => {
      const mark = (e.target as HTMLElement).closest?.(selector) as HTMLElement | null;
      if (!mark) return;
      e.stopPropagation();
      cancelHide();
      markRef.current = null; // re-anchor even on the already-hovered mark
      openOn(mark);
    };
    const onOut = (e: Event) => {
      const to = (e as MouseEvent).relatedTarget as HTMLElement | null;
      if (markRef.current && to?.closest?.(selector) === markRef.current) return;
      if (to?.closest?.(".rmark-pop")) return; // moving onto the popover → keep open
      scheduleHide();
    };
    root.addEventListener("mouseover", onOver);
    root.addEventListener("mouseout", onOut);
    root.addEventListener("click", onClick);
    return () => {
      cancelHide();
      root.removeEventListener("mouseover", onOver);
      root.removeEventListener("mouseout", onOut);
      root.removeEventListener("click", onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, selector]);

  // Dismiss the desktop popover on scroll; the sheet is a scrimmed overlay, scroll
  // can't detach it.
  useEffect(() => {
    if (!hov || sheetMode.current) return;
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hov]);

  return { hov, below, sheetOpen, sheetMode, close, cancelHide, scheduleHide };
}
