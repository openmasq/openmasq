// THE TOOLTIP, for the console — the app's, without the app.
//
// The desktop labels its glyph-only controls with the native `title` attribute and then
// renders those labels itself (`packages/ui` `TooltipLayer`), because the browser's own
// bubble arrives after about a second, in OS chrome that ignores the theme, and in some
// contexts never. The console had the same problem and the same `title` attributes, so it
// gets the same treatment rather than a second idea of what a tooltip is.
//
// ⚠️ The ARITHMETIC is not re-implemented here: `placeTooltip` comes from `@openmasq/ui`
// (`./tooltip`, a source-condition export the page's bundler reads straight). All three of
// its failure modes are silent — a bubble half off-screen still "renders" — so the one place
// they are tested is the one place they are computed. What IS local is the plumbing: React
// hooks on one side, a delegated listener on the other.
//
// Delegated, like the app's, for the same reason: the labels already exist on the controls,
// already say the right thing. This takes them and draws them properly.
import { placeTooltip, tooltipLabelOf } from "@openmasq/ui/tooltip";

/** Pointer rest before the bubble appears. The app's number, for the app's reason: long
 *  enough that sweeping across a row of glyph buttons stays quiet, short enough to answer
 *  someone who stopped BECAUSE they don't recognise the icon. */
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
 * Mount as soon as there is a body to mount INTO.
 *
 * ⚠️ The bundle is loaded from `<head>`, so at module evaluation `document.body` is still
 * null. Appending to it there threw — and because the bundle is an IIFE assigned to a global,
 * a throw inside it means the global is never assigned at all: the page then found no API,
 * every call site fell to its degraded path, and the masking panel redrew on every poll
 * because the "did anything change" watch it could not reach answers yes by default. One
 * missing null check, two symptoms, neither of them looking like a tooltip.
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
