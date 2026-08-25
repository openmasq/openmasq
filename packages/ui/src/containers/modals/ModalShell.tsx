import { useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";

/**
 * Shared modal chrome — a dimmed scrim with a centered (or top-aligned) card,
 * matching the redact reference. The scrim fades and the panel zooms in/out
 * (framer-motion). For the exit (zoom-out) to play, render inside an
 * <AnimatePresence> at the call site: `<AnimatePresence>{open && <Modal/>}</…>`.
 * Escape / scrim-click dismiss.
 *
 * The panel carries the kit's two brand marks: a marker top bar, and a one-shot
 * sweep on open (the "unmask" reveal). Both are decorative — aria-hidden, no
 * pointer events — so they never reach the accessibility tree. Titles inside the
 * body go through <ModalTitle>.
 *
 * ⚠️ `.modal-scrim` is load-bearing: hooks/modalGate.ts matches it to hide the
 * always-on-top native agent-browser window. Don't rename it.
 *
 * `panel` (kit): render the SAME children as an inline right-side PANEL — full
 * height, hairline on the left — with no scrim, no portal-fixed layer
 * and deliberately NO `.modal-scrim`/dialog role (it is page content, not a modal;
 * it must not trip the agent-browser modal gate). Escape still closes. It fades in
 * WITHOUT a horizontal slide: the document view is a stable surface the user reads
 * and re-opens, so a slide-left on every open reads as churn, not arrival.
 */
export function ModalShell({
  onClose,
  children,
  width = "520px",
  maxHeight,
  align = "center",
  panel = false,
}: {
  onClose: () => void;
  children: ReactNode;
  width?: string;
  maxHeight?: string;
  align?: "center" | "top";
  panel?: boolean;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  if (panel) {
    return (
      <motion.div
        className="modal-inline-panel"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    );
  }
  return (
    <motion.div
      className={`modal-scrim ${align === "top" ? "top" : ""}`}
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
    >
      <motion.div
        className={`modal-panel ${align === "top" ? "top" : ""}`}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        // width / maxHeight are runtime props — the rule's allowed inline case.
        style={{ width, maxHeight }}
      >
        <motion.div
          className="modal-sweep"
          aria-hidden="true"
          initial={{ x: "-70%" }}
          animate={{ x: "190%" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
        {children}
      </motion.div>
    </motion.div>
  );
}
