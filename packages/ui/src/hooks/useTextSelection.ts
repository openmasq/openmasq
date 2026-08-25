import { useCallback, useEffect, useState } from "react";
import { selectionBelongsTo, selectionIsUserText } from "./selectionOwner";

/** A finalized text selection made inside the tracked container: the viewport point
 *  (top-centre of the selection rect) to anchor a floating menu, plus the text. */
export interface SelectionAnchor {
  x: number;
  y: number;
  text: string;
}

export interface TextSelectionOptions {
  /**
   * When set, the selection ALSO has to sit inside an element matching this selector,
   * or it is ignored. The message list passes `[data-user-text]` so the floating menu
   * appears over what the user wrote and what the model answered — never over the app's
   * own text (model name, captions, notices, tool trace). Omit it where every character
   * in the container is content, as in the document preview.
   */
  within?: string;
}

/**
 * Track a text selection made INSIDE `containerRef` (a message list), exposing a
 * viewport-anchored point so a floating menu can pop above it. Wire the returned
 * `onMouseUp` to the container. Clears on an empty/collapsed/out-of-container
 * selection, on scroll, on a mousedown outside the menu (`[data-sel-menu]`), and on
 * Escape — dismissal belongs HERE, with the state owner, so every menu this anchors
 * (chat message, document preview) is keyboard-dismissable without per-caller wiring.
 */
export function useTextSelection(
  containerRef: React.RefObject<HTMLElement | null>,
  options: TextSelectionOptions = {},
) {
  const within = options.within;
  const [sel, setSel] = useState<SelectionAnchor | null>(null);
  const clear = useCallback(() => setSel(null), []);

  const onMouseUp = useCallback(() => {
    // Defer a frame so a drag-select is finalized before we read it.
    requestAnimationFrame(() => {
      const s = window.getSelection();
      const host = containerRef.current;
      if (!s || s.isCollapsed || !host) return setSel(null);
      const text = s.toString().trim();
      if (!text) return setSel(null);
      const range = s.getRangeAt(0);
      // Containment is not ownership — a modal renders INSIDE this container, and its
      // selection is its own (`selectionOwner.ts`).
      if (!selectionBelongsTo(host, range.commonAncestorContainer)) return setSel(null);
      // …and inside CONTENT, when the caller says what content is. The app's own text
      // (model name, captions, notices, trace) shares this container but is not
      // something to redact, clarify or remember (`selectionIsUserText`).
      if (within && !selectionIsUserText(range.commonAncestorContainer, within)) {
        return setSel(null);
      }
      const r = range.getBoundingClientRect();
      if (!r.width && !r.height) return setSel(null);
      setSel({ x: r.left + r.width / 2, y: r.top, text });
    });
  }, [containerRef, within]);

  useEffect(() => {
    if (!sel) return;
    const dismiss = () => setSel(null);
    const onDown = (e: MouseEvent) => {
      // A click on the menu itself must NOT dismiss it (the menu marks its root).
      if (!(e.target as Element | null)?.closest?.("[data-sel-menu]")) setSel(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // CAPTURE + stopPropagation: in the attachment preview the same Escape would
      // ALSO close the modal (`ModalShell` listens on window, bubble phase) — the
      // menu closes alone, the modal on the next press.
      e.stopPropagation();
      setSel(null);
    };
    // Any scroll (the message list scrolls the window's capture phase) drops it.
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [sel]);

  return { sel, onMouseUp, clear };
}
