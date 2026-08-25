import { useCallback, useEffect, useState } from "react";

/** A finalized selection inside a `<textarea>`: the selected text + a viewport
 *  point to anchor a floating menu above (mouse point, else the textarea top). */
export interface TextareaSelection {
  text: string;
  x: number;
  y: number;
}

/**
 * Track a text selection made INSIDE a `<textarea>` (the composer). Unlike
 * `useTextSelection` — which reads `window.getSelection()` over rendered DOM — a
 * textarea's selection lives in `selectionStart/selectionEnd`, so this reads those.
 * Wire `onSelect` to the textarea's `onMouseUp`/`onKeyUp` (pass the mouse event to
 * anchor at the pointer). Clears on collapse, blur, scroll, a mousedown outside
 * the menu (`[data-sel-menu]`), or Escape — dismissal lives with the state owner,
 * mirroring `useTextSelection`.
 */
export function useTextareaSelection(taRef: React.RefObject<HTMLTextAreaElement | null>) {
  const [sel, setSel] = useState<TextareaSelection | null>(null);
  const clear = useCallback(() => setSel(null), []);

  const onSelect = useCallback(
    (e?: { clientX: number; clientY: number }) => {
      const clientX = e?.clientX;
      const clientY = e?.clientY;
      // Defer a frame so a drag-select is finalized before we read it.
      requestAnimationFrame(() => {
        const ta = taRef.current;
        if (!ta) return setSel(null);
        const { selectionStart: s, selectionEnd: en, value } = ta;
        if (s == null || en == null || s === en) return setSel(null);
        const text = value.slice(s, en).trim();
        if (!text) return setSel(null);
        const rect = ta.getBoundingClientRect();
        setSel({
          text,
          x: clientX ?? rect.left + rect.width / 2,
          y: clientY ?? rect.top,
        });
      });
    },
    [taRef],
  );

  useEffect(() => {
    if (!sel) return;
    const onDown = (e: MouseEvent) => {
      // A click on the menu itself must NOT dismiss it (the menu marks its root).
      if (!(e.target as Element | null)?.closest?.("[data-sel-menu]")) setSel(null);
    };
    const onScroll = () => setSel(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // CAPTURE + stopPropagation: in `ComposerTextModal` the same Escape would ALSO
      // close the modal (`ModalShell` listens on window, bubble phase) — the menu
      // closes alone, the modal on the next press.
      e.stopPropagation();
      setSel(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [sel]);

  return { sel, onSelect, clear };
}
