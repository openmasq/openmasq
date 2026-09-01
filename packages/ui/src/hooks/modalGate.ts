// The agent-browser is a SEPARATE native window (`frame:false` + `alwaysOnTop`), so
// it has NO DOM z-order and floats above every DOM element — including a centered
// modal. The only way to keep a modal usable is to HIDE the native window while any
// modal is open. Both places that own the window's visibility — the global gate in
// `AppShell` and the panel's `useBrowserBounds` — must key off the SAME definition of
// "a modal is open", or they disagree and the window covers the modal again. This is
// that single source of truth.

/** Any blocking modal / overlay: `ModalShell`'s scrim, the auth scrim, or any element
 *  flagged as a dialog. Kept in sync across the two visibility owners. */
export const MODAL_SELECTOR = ".modal-scrim, .auth-scrim, [aria-modal='true'], [role='dialog']";

/** True when at least one blocking modal is mounted in the document. */
export const isModalOpen = (): boolean =>
  typeof document !== "undefined" && document.querySelector(MODAL_SELECTOR) !== null;

// Transient, imperative blocks that must ALSO hide the agent-browser overlay even
// though no DOM modal is up — e.g. while dragging the split gutter, the native window
// (alwaysOnTop) would otherwise capture the pointer and break the drag.
let overlayBlocks = 0;
export function blockAgentOverlay(): void {
  overlayBlocks++;
}
export function unblockAgentOverlay(): void {
  overlayBlocks = Math.max(0, overlayBlocks - 1);
}

/** The single decision the overlay's two visibility owners (`AppShell` + `useBrowserBounds`)
 *  key off: hide the native agent window while a modal is open OR an imperative block is
 *  active (split-gutter drag), so it never covers a modal nor steals a drag's pointer. */
export const shouldHideAgentBrowser = (): boolean => overlayBlocks > 0 || isModalOpen();

// ── Do the bounds need to be RESTATED? ──────────────────────────────────────────────
//
// This window's visibility has TWO owners (`useAgentBrowserVisibility`, global, and
// `useBrowserBounds`, panel side) and each holds its own belief. Only the second one
// writes the bounds, deduplicating on the last rectangle sent: when the FIRST one
// brings the window back up, the second knows nothing about it, re-emits nothing —
// and it reappears at the PREVIOUS bounds. If the layout moved in the meantime
// (sidebar expanded, panel resized), it comes back OFFSET, and nothing corrects it
// until the rectangle changes on its own.
//
// Hence this counter, in the same file as the rest of what we know about this window:
// whoever SHOWS it increments it, whoever WRITES folds it into its deduplication key.
// Cost of a false positive: one extra `setBounds`. Cost of a false negative: the offset.
let boundsEpoch = 0;

/** Call just before/after having MADE the window visible: the next frame will
 *  re-emit the bounds even if the rectangle hasn't changed. */
export function invalidateAgentBrowserBounds(): void {
  boundsEpoch++;
}

/** The current value, to include in the writer's deduplication key. */
export const agentBrowserBoundsEpoch = (): number => boundsEpoch;

/** The element the native window is pinned to (`useBrowserBounds` writes ITS rect as the
 *  window's bounds), so its rect IS where the overlay currently paints. */
const VIEWPORT_SELECTOR = ".browser-viewport";

/**
 * Where the native agent window covers the DOM right now, or `null` when it isn't up.
 *
 * A tooltip is not a modal, so it never triggers the hide above — and a bubble that lands
 * on this rectangle is simply INVISIBLE (no z-index reaches over a separate alwaysOnTop
 * window). `TooltipLayer` feeds this to `placeTooltip`, which then flips to the free side.
 * It reads the SAME predicate as the bounds writer, so the two can't disagree about
 * whether the window is on screen.
 */
export function agentBrowserRect(): { top: number; left: number; width: number; height: number } | null {
  if (typeof document === "undefined" || shouldHideAgentBrowser()) return null;
  const el = document.querySelector(VIEWPORT_SELECTOR);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
}
