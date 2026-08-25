import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * THE mobile bottom sheet (design kit `chat-app-mobile` `BottomSheet`): a scrim +
 * a rounded panel sliding up from the bottom edge. Pure chrome — open/close state
 * and the content are the caller's; this only owns mount timing (the panel must
 * be IN the DOM one frame before `.open` lands, or the slide-in transition never
 * plays) and the exit delay (unmount after the slide-out finishes).
 *
 * Portals into the `.app-mobile` shell root, NOT `document.body`: the mobile CSS
 * family is scoped under `.app-mobile`, and the sheet must inherit the shell's
 * safe-area / theme context. Falls back to body only when no mobile shell is
 * mounted (a stray desktop render — the sheet still works, unstyled edge cases
 * aside). `role="dialog"` + `aria-modal` so the overlay trips `modalGate` like
 * every other blocking surface.
 */
export function BottomSheet({
  open,
  onClose,
  children,
  maxH = "76dvh",
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Panel max height — a runtime prop (rule 6's allowed inline case). */
  maxH?: string;
  /** Accessible name for the dialog. */
  label?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      setMounted(true);
      // Double rAF: the panel must commit at translateY(101%) first, then flip
      // to `.open` — a same-frame flip skips the transition entirely.
      const raf = requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true)),
      );
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    if (mounted) closeTimer.current = setTimeout(() => setMounted(false), 340);
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape closes, like every modal (ModalShell parity).
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!mounted) return null;
  const host =
    typeof document !== "undefined"
      ? (document.querySelector(".app-mobile") ?? document.body)
      : null;
  if (!host) return null;

  const sheet = (
    <div className={`bsheet-layer${visible ? " open" : ""}`}>
      <div className="bsheet-scrim" onClick={onClose} aria-hidden="true" />
      <div
        className="bsheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={{ maxHeight: maxH } as CSSProperties}
      >
        <div className="bsheet-grip-row" aria-hidden="true">
          <span className="bsheet-grip" />
        </div>
        {children}
      </div>
    </div>
  );
  return createPortal(sheet, host);
}
