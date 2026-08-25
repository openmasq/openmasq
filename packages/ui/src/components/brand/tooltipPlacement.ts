/** A rectangle in VIEWPORT coordinates (what `getBoundingClientRect` returns). */
export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface TooltipPlacement {
  top: number;
  left: number;
  /** The bubble sits ABOVE the trigger — the caller flips the entry animation. */
  above: boolean;
}

/** px between the trigger and the bubble. */
const GAP = 8;
/** px kept clear of the viewport edges. */
const MARGIN = 8;

/**
 * Where the bubble goes: centred under its trigger, flipped above when the space below
 * can't hold it, and always clamped inside the viewport.
 *
 * Pure and measured in real pixels, because all three failure modes are silent — a
 * bubble half off-screen still "renders", so nothing but arithmetic catches it:
 *  - the trigger sits at the right edge (the rail's buttons, a row's ⋯) → the centred
 *    bubble would overflow to the right;
 *  - the trigger sits at the BOTTOM (the composer's action row, the sidebar's account
 *    button) → below is off-screen;
 *  - the label is a full sentence, so the bubble is wide and BOTH apply at once.
 */
export function placeTooltip(
  trigger: Rect,
  bubble: { width: number; height: number },
  viewport: { width: number; height: number },
  /** A region the bubble is INVISIBLE inside — the native agent-browser window, which has
   *  no DOM z-order and paints over everything. Absent/null ⇒ only the viewport bounds. */
  obstacle?: Rect | null,
): TooltipPlacement {
  const below = viewport.height - (trigger.top + trigger.height) - GAP - MARGIN;
  const above = trigger.top - GAP - MARGIN;
  // Flip only when below genuinely can't hold it AND above holds it better — flipping
  // on a tie makes the bubble jump as the window resizes.
  let flip = below < bubble.height && above > below;

  const centred = trigger.left + trigger.width / 2 - bubble.width / 2;
  // Clamp to the viewport. `Math.max(MARGIN, …)` comes LAST so a bubble wider than the
  // viewport pins to the left edge rather than being pushed off the left one.
  const left = Math.max(MARGIN, Math.min(centred, viewport.width - bubble.width - MARGIN));

  const belowTop = trigger.top + trigger.height + GAP;
  const aboveTop = trigger.top - GAP - bubble.height;
  // ⚠️ Landing on the agent browser is not "overlapped", it is GONE: that window is a
  // separate native, alwaysOnTop surface, so no z-index reaches over it. A side that is
  // merely TIGHT therefore beats a side that is covered — which is why this runs after
  // the fit test and can overrule it. The browser sits under the panel's chrome, so the
  // buttons that were losing their label (back / forward / reload / ✕ / the rail) all
  // have room on the other side.
  const hidden = (top: number): boolean =>
    !!obstacle &&
    left < obstacle.left + obstacle.width &&
    left + bubble.width > obstacle.left &&
    top < obstacle.top + obstacle.height &&
    top + bubble.height > obstacle.top;
  if (flip && hidden(aboveTop) && !hidden(belowTop)) flip = false;
  else if (!flip && hidden(belowTop) && !hidden(aboveTop)) flip = true;

  return { left, top: flip ? aboveTop : belowTop, above: flip };
}

/**
 * The label a hovered element contributes, or `null` when it must stay silent.
 *
 * Empty/whitespace titles are how several call sites say "no tip" already, and
 * `data-tip="off"` is the explicit opt-out for an element whose `title` is meant for
 * something else (a native drag hint, a test hook).
 */
export function tooltipLabelOf(el: Element): string | null {
  if (el.getAttribute("data-tip") === "off") return null;
  const label = el.getAttribute("title")?.trim();
  return label ? label : null;
}
