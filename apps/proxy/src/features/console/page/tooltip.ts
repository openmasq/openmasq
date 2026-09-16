// THE TOOLTIP, for the console — the app's, without the app. The desktop labels its
// glyph-only controls with the native `title` attribute and renders those labels itself
// (`packages/ui` `TooltipLayer`), because the browser's own bubble is slow, unthemed and
// sometimes absent. Same treatment here. The ARITHMETIC is not re-implemented: `placeTooltip`
// comes from `@openmasq/ui`, the one place it is tested. What IS local is the plumbing: a
// delegated listener, so the labels already on the controls are what gets drawn.
import { placeTooltip, tooltipLabelOf } from "@openmasq/ui/tooltip";

/** Pointer rest before the bubble appears — the app's number: long enough that sweeping
 *  across a row of glyph buttons stays quiet, short enough to answer a stopped pointer. */
const OPEN_DELAY_MS = 400;

/** The native bubble must go while ours is up, or both appear. Put back on leave — the DOM a
 *  screen reader or a test inspects is unchanged, since neither hovers. */
interface Stripped {
  el: Element;
  title: string;
}

export interface TooltipLayer {
  stop(): void;
}

/**
 * Mount the layer on a document. Returns a handle that removes every listener and restores
 * any `title` it had taken — a page that is torn down must not leave a control mute.
 */
/**
 * Mount as soon as there is a body to mount INTO. The bundle is loaded from `<head>`, so at
 * module evaluation `document.body` is still null — and because the bundle is an IIFE
 * assigned to a global, a throw there means the page finds no API at all.
 */
export function mountTooltipsWhenReady(doc: Document = document): void {
  if (doc.body) {
    mountTooltips(doc);
    return;
  }
  doc.addEventListener("DOMContentLoaded", () => mountTooltips(doc), { once: true });
}

export function mountTooltips(doc: Document = document): TooltipLayer {
  const bubble = doc.createElement("div");
  bubble.className = "tip";
  bubble.setAttribute("role", "tooltip");
  bubble.hidden = true;
  doc.body.appendChild(bubble);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let stripped: Stripped | null = null;

  const restore = (): void => {
    if (stripped) stripped.el.setAttribute("title", stripped.title);
    stripped = null;
  };

  const hide = (): void => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    bubble.hidden = true;
    restore();
  };

  const show = (el: Element, label: string): void => {
    // Taken only now, so the native bubble never had time to open either.
    stripped = { el, title: label };
    el.removeAttribute("title");
    bubble.textContent = label;
    bubble.hidden = false;
    const r = el.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    const at = placeTooltip(
      { top: r.top, left: r.left, width: r.width, height: r.height },
      { width: b.width, height: b.height },
      { width: doc.documentElement.clientWidth, height: doc.documentElement.clientHeight },
    );
    bubble.style.top = `${at.top}px`;
    bubble.style.left = `${at.left}px`;
    bubble.classList.toggle("above", at.above);
  };

  /** The nearest ancestor that has something to say — a label often sits on the button, not
   *  on the glyph inside it that the pointer actually entered. */
  const labelled = (target: EventTarget | null): { el: Element; label: string } | null => {
    let el = target instanceof Element ? target : null;
    while (el) {
      const label = tooltipLabelOf(el);
      if (label) return { el, label };
      el = el.parentElement;
    }
    return null;
  };

  const arm = (target: EventTarget | null): void => {
    const found = labelled(target);
    if (!found) {
      hide();
      return;
    }
    if (stripped?.el === found.el) return; // already showing this one
    hide();
    timer = setTimeout(() => show(found.el, found.label), OPEN_DELAY_MS);
  };

  const onOver = (e: Event): void => arm(e.target);
  // Keyboard focus gets it with NO delay: there is no pointer to rest, so a delay reads as
  // "this control has no tooltip".
  const onFocus = (e: Event): void => {
    const found = labelled(e.target);
    if (found) {
      hide();
      show(found.el, found.label);
    }
  };
  const onOut = (): void => hide();
  // A tooltip must never outlive what it points at: a scroll, a key or a click moves the
  // world under the bubble, and a stale bubble is worse than none.
  const onGone = (): void => hide();

  doc.addEventListener("mouseover", onOver, true);
  doc.addEventListener("mouseout", onOut, true);
  doc.addEventListener("focusin", onFocus, true);
  doc.addEventListener("focusout", onOut, true);
  doc.addEventListener("keydown", onGone, true);
  doc.addEventListener("click", onGone, true);
  doc.addEventListener("scroll", onGone, true);

  return {
    stop() {
      hide();
      doc.removeEventListener("mouseover", onOver, true);
      doc.removeEventListener("mouseout", onOut, true);
      doc.removeEventListener("focusin", onFocus, true);
      doc.removeEventListener("focusout", onOut, true);
      doc.removeEventListener("keydown", onGone, true);
      doc.removeEventListener("click", onGone, true);
      doc.removeEventListener("scroll", onGone, true);
      bubble.remove();
    },
  };
}
