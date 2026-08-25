import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { agentBrowserRect } from "../../hooks/modalGate";
import { placeTooltip, tooltipLabelOf, type TooltipPlacement } from "./tooltipPlacement";

/** Pointer rest before the bubble appears — long enough that sweeping across a row of
 *  glyph buttons stays quiet, short enough to answer someone who stopped BECAUSE they
 *  don't recognise the icon. Keyboard focus gets it with no delay: there is no pointer
 *  to rest, so a delay reads as "this control has no tooltip". */
const OPEN_DELAY_MS = 400;

/**
 * THE tooltip. One delegated listener for the whole app, mounted once by `ShellChrome`.
 *
 * **Why delegated rather than a prop on every control.** The app labels its glyph-only
 * controls with the native `title` attribute in ~120 places across ~64 files. Those
 * labels are already written, already translated, already correct — what was wrong is
 * only how the browser DRAWS them: after its own ~1s delay, in OS chrome that ignores
 * the theme, and never at all in some contexts. So this layer takes the labels that
 * exist and renders them properly, instead of a 64-file migration that would drift back
 * apart one call site at a time.
 *
 * **It suppresses the native tooltip by removing `title` while hovered**, then puts it
 * back — otherwise both appear. The attribute is restored on leave AND on unmount, so
 * the DOM a screen reader or a test inspects is unchanged (neither hovers).
 *
 * Absent this layer (a preview harness mounting a bare component), every control simply
 * falls back to the native tooltip: nothing loses its label.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<{ el: Element; label: string } | null>(null);
  const [at, setAt] = useState<TooltipPlacement | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The element whose `title` we removed, so we can always put it back — including on
  // unmount, when no pointer event will ever come.
  const stripped = useRef<{ el: Element; title: string } | null>(null);

  const restoreTitle = useCallback(() => {
    const s = stripped.current;
    if (s) s.el.setAttribute("title", s.title);
    stripped.current = null;
  }, []);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    restoreTitle();
    setTip(null);
    setAt(null);
  }, [restoreTitle]);

  const show = useCallback(
    (el: Element, delay: number) => {
      clearTimeout(timer.current);
      const label = tooltipLabelOf(el);
      if (!label) return;
      timer.current = setTimeout(() => {
        // Strip LAST — at fire time, not at hover time — so a pointer that merely swept
        // across never loses its native tooltip for the frames it was over the element.
        restoreTitle();
        stripped.current = { el, title: label };
        el.removeAttribute("title");
        setTip({ el, label });
      }, delay);
    },
    [restoreTitle],
  );

  useEffect(() => {
    const owner = (t: EventTarget | null): Element | null =>
      t instanceof Element ? t.closest("[title]") : null;

    const onOver = (e: PointerEvent) => {
      const el = owner(e.target);
      if (el) show(el, OPEN_DELAY_MS);
      else if (!stripped.current) clearTimeout(timer.current);
    };
    const onOut = (e: PointerEvent) => {
      // `pointerout` also fires moving BETWEEN children of the same trigger; only a
      // move that genuinely leaves the owner should dismiss.
      const from = owner(e.target);
      const to = e.relatedTarget instanceof Element ? e.relatedTarget.closest("[title]") : null;
      if (from && from !== to) hide();
      else if (!from && !to) hide();
    };
    const onFocus = (e: FocusEvent) => {
      const el = owner(e.target);
      if (el) show(el, 0);
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    // A click ACTS — the label has served its purpose and the bubble would sit over the
    // result. Scroll/resize move the trigger out from under it.
    document.addEventListener("pointerdown", hide, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      clearTimeout(timer.current);
      restoreTitle();
    };
  }, [show, hide, restoreTitle]);

  // Measured AFTER the bubble is in the DOM (its width depends on the label, which
  // wraps) but BEFORE paint — placing it post-paint shows it at the wrong spot for a
  // frame. It renders hidden until `at` is set, so that frame is never visible.
  useLayoutEffect(() => {
    if (!tip) return;
    const b = bubbleRef.current?.getBoundingClientRect();
    if (!b) return;
    setAt(
      placeTooltip(
        tip.el.getBoundingClientRect(),
        b,
        { width: window.innerWidth, height: window.innerHeight },
        // The agent browser is a native alwaysOnTop window: a bubble over it is not
        // overlapped, it is gone. Measured at show time — the panel may have opened,
        // moved or closed since the last tip.
        agentBrowserRect(),
      ),
    );
  }, [tip]);

  if (!tip || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={bubbleRef}
      className={`cv-tooltip${at ? "" : " measuring"}${at?.above ? " above" : ""}`}
      role="tooltip"
      // Runtime-measured position — the rule-6 inline-style exception.
      style={at ? { top: at.top, left: at.left } : undefined}
    >
      {tip.label}
    </div>,
    document.body,
  );
}
