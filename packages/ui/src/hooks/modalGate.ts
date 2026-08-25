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

// ── Les bornes sont-elles à REDIRE ? ──────────────────────────────────────────────
//
// La visibilité de cette fenêtre a DEUX propriétaires (`useAgentBrowserVisibility`, global,
// et `useBrowserBounds`, côté panneau) et chacun tient sa propre croyance. Or seul le
// second écrit les bornes, en dédupliquant sur le dernier rectangle envoyé : quand le
// PREMIER remonte la fenêtre, le second n'en sait rien, ne réémet rien — et elle
// réapparaît aux bornes d'AVANT. Si la mise en page a bougé entre-temps (barre latérale
// étendue, panneau redimensionné), elle revient DÉCALÉE, et rien ne la recale tant que le
// rectangle ne rechange pas de lui-même.
//
// D'où ce compteur, dans le même fichier que le reste de ce qu'on sait de cette fenêtre :
// celui qui MONTRE l'incrémente, celui qui ÉCRIT le plie dans sa clé de déduplication.
// Coût d'un faux positif : un `setBounds` de trop. Coût d'un faux négatif : le décalage.
let boundsEpoch = 0;

/** À appeler juste avant/après avoir RENDU la fenêtre visible : la prochaine trame
 *  réémettra les bornes même si le rectangle n'a pas changé. */
export function invalidateAgentBrowserBounds(): void {
  boundsEpoch++;
}

/** La valeur courante, à inclure dans la clé de déduplication de l'écrivain. */
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
