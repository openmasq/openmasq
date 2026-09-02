import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ModalTitle } from "./ModalTitle";
import { useDialogFocus } from "../../hooks/useDialogFocus";

/**
 * Shared modal chrome — a dimmed scrim with a centered (or top-aligned) card,
 * matching the redact reference. The scrim fades and the panel zooms in/out
 * (framer-motion). For the exit (zoom-out) to play, render inside an
 * <AnimatePresence> at the call site: `<AnimatePresence>{open && <Modal/>}</…>`.
 * Escape / scrim-click dismiss.
 *
 * THE accessible dialog, once: the panel is `role="dialog"` + `aria-modal`, takes
 * focus on open and traps Tab (`useDialogFocus`), hands focus back to the control
 * that opened it on close, and is labelled by its `title` when one is given.
 *
 * Escape is handled ON THE PANEL (React `onKeyDown`), not by a window listener: the
 * key goes to the layer that has focus, so a dialog stacked over another closes alone.
 * An INNER layer that consumes Escape (a corner menu, the selection menu) marks it
 * with `preventDefault()` and the shell yields — never `stopPropagation`, which would
 * hide the key from everyone. Consequence: an Escape pressed while focus sits OUTSIDE
 * the panel does nothing, which is the behaviour of a focus-trapped dialog anyway.
 *
 * `title` / `eyebrow` / `icon` / `headEnd` render the house head (`.modal-head`) so a
 * modal does not hand-roll one; a modal with a richer head (a document viewer's
 * toolbar) keeps its own and passes nothing.
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
 * it must not trip the agent-browser modal gate) and NO focus trap. Escape still
 * closes it — from inside it. It fades in WITHOUT a horizontal slide: the document
 * view is a stable surface the user reads and re-opens, so a slide-left on every
 * open reads as churn, not arrival.
 */
export function ModalShell({
  onClose,
  children,
  width = "520px",
  maxHeight,
  align = "center",
  panel = false,
  title,
  eyebrow,
  icon,
  tone,
  headEnd,
}: {
  onClose: () => void;
  children: ReactNode;
  width?: string;
  maxHeight?: string;
  align?: "center" | "top";
  panel?: boolean;
  /** The head's title (a `ModalTitle`) — also what labels the dialog for a reader. */
  title?: ReactNode;
  /** The small mono label above the title. Ignored without `title`. */
  eyebrow?: ReactNode;
  /** A glyph before the title, in the head's square (`.modal-head-ic`). */
  icon?: ReactNode;
  /** `danger` tints the glyph's square red — a destructive confirmation. */
  tone?: "danger";
  /** What sits at the head's far end (a call to action). */
  headEnd?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocus(ref, { enabled: !panel });
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape" || e.isDefaultPrevented()) return;
    e.preventDefault();
    onClose();
  };
  const head = title !== undefined && (
    <div className="modal-head">
      {icon !== undefined && <span className={`modal-head-ic${tone ? ` ${tone}` : ""}`}>{icon}</span>}
      <div className="modal-head-text">
        {eyebrow !== undefined && <div className="cv-eyebrow modal-eyebrow">{eyebrow}</div>}
        <ModalTitle id={titleId}>{title}</ModalTitle>
      </div>
      {headEnd}
    </div>
  );
  if (panel) {
    return (
      <motion.div
        className="modal-inline-panel"
        ref={ref}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        {head}
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
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title !== undefined ? titleId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
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
        {head}
        {children}
      </motion.div>
    </motion.div>
  );
}
