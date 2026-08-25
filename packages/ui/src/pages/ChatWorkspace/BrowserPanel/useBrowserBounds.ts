import { useEffect, type RefObject } from "react";
import type { BrowserHost } from "../../../host";
import { agentBrowserBoundsEpoch, shouldHideAgentBrowser } from "../../../hooks/modalGate";

/**
 * Overlays the native agent-browser window onto a DOM viewport element for as
 * long as the panel is mounted. The agent browser is a SEPARATE top-level
 * Electron window (CDP-isolated) — it can't live inside the React tree — so we
 * position it over `viewportRef`'s rectangle and keep it in sync.
 *
 * Sync strategy: a rAF loop reads the element's viewport rect each frame and
 * pushes it to `browser.setBounds` ONLY when it changed (so it follows sidebar
 * animations, window moves/resizes, and tab switches without an IPC per frame).
 * `show()` on mount, `hide()` on unmount. After `show()` resolves (the isolated
 * process just spawned) we force one resend, since the earliest `setBounds`
 * calls were dropped while the child didn't exist yet.
 *
 * Modal-vs-overlay handling: the alwaysOnTop window has NO DOM z-order, so it would
 * cover a centered modal (write-confirmation, settings…). This hook NEVER shows the
 * window while a modal is open and hides it the instant one appears — re-checked every
 * frame (via `isModalOpen`), so it can't lose a race with a modal that mounts at the
 * same time as the panel (the reported bug: the auto-reveal opened the panel exactly as
 * a `browser_navigate` write-confirm dialog appeared, and the panel's unconditional
 * `show()` re-covered it). `AppShell` runs the SAME gate globally (keyed off the shared
 * `modalGate` selector) for the panel-CLOSED case; both agree, so they never conflict.
 * This hook owns BOUNDS + the panel-lifecycle, modal-gated show/hide.
 *
 * RESIZE handling — window resize AND animated layout, same remedy: during a live
 * app-window resize the rAF is throttled, so the native overlay would sit STUCK at its old
 * size over a panel that already reflowed (the reported "taille statique"). So while it is
 * actively resizing we HIDE the overlay (the DOM panel shows through) and, ~160ms after the
 * last event, re-show it — resending the fresh rect so it SNAPS to the final geometry.
 * ⚠️ A CSS width TRANSITION counts: `.nav-dock` glides over 0.26s, and tracking it frame by
 * frame means one IPC per frame to another PROCESS, which visibly trails behind the DOM
 * panel (the reported "décalée si l'on étend la sidebar"). Following it smoothly is not
 * achievable across that boundary, so we stop pretending and snap at the end instead.
 * The ResizeObserver on the viewport only re-arms the send (no hide): it covers a
 * throttled frame on a layout change that is NOT animated, where there is nothing to trail.
 *
 * WINDOW-move handling: the overlay is positioned in SCREEN coords (the Host `setBounds`
 * adds `window.screenX/Y` to the viewport rect), but MOVING the app window changes the
 * screen origin WITHOUT changing the viewport rect — so a dedup keyed on the rect alone
 * never resends and the alwaysOnTop overlay sits STATIC at its old screen spot while the
 * app slides out from under it (the reported "reste statique si on déplace l'app", and
 * why repositioning the app felt broken). There is no DOM 'move' event, so we detect it
 * in the rAF by watching `window.screenX/Y` frame-over-frame; the screen origin is folded
 * into the dedup key so a move triggers a resend, and — as with a resize — the overlay is
 * HIDDEN while actively moving (repositioning an alwaysOnTop window every frame fights the
 * OS drag and trails behind) then re-snapped ~160ms after the move settles.
 */
/** Plafond du masquage dû à une ANIMATION de mise en page. `.nav-dock` glisse en 0,26 s ;
 *  au-delà de cette marge, une rafale qui continue n'est plus une transition de mise en
 *  page mais quelque chose qui boucle — et l'overlay doit revenir malgré elle. */
const MAX_ANIM_HIDE_MS = 600;

export function useBrowserBounds(browser: BrowserHost | undefined, viewportRef: RefObject<HTMLElement>) {
  useEffect(() => {
    if (!browser) return;
    let raf = 0;
    let last = "";
    let shown = false;
    let alive = true;
    let resizing = false;
    let resizeT: number | undefined;
    let moving = false;
    let moveT: number | undefined;
    // Baseline the on-screen origin so the FIRST tick doesn't read as a move.
    let lastScreen = `${window.screenX},${window.screenY}`;
    // Re-arm the next tick's send (clears the dedup key) so the current rect is re-pushed.
    const forceResend = () => {
      last = "";
    };
    // The app window is actively resizing: hide the overlay now, re-show once it settles.
    const onWindowResize = () => {
      forceResend();
      resizing = true;
      window.clearTimeout(resizeT);
      resizeT = window.setTimeout(() => {
        resizing = false;
      }, 160);
    };
    // ── Une TRANSITION de largeur est un redimensionnement, et se traite comme tel ──
    //
    // `.nav-dock` (la barre latérale gauche) anime sa largeur sur 0,26 s : le panneau se
    // reflue trame par trame, et l'overlay le suit par une IPC par trame vers un AUTRE
    // processus — il traîne donc visiblement derrière, en décalage, pendant toute
    // l'animation. Le commentaire d'origine pariait que le rAF suivrait « sans
    // scintillement » ; en pratique c'est le décalage qu'on voit, et il est pire.
    // Même remède que pour un redimensionnement de fenêtre : on cache, on recale à la fin.
    // Filtré sur `width` et sur les transitions qui ATTEIGNENT le document, donc une
    // animation de couleur ou d'opacité (les survols du rail) ne déclenche rien.
    // ⚠️ BORNÉ, et c'est la partie importante. Ce masquage se ré-arme à chaque transition :
    // sans plafond, un flux continu de transitions de `width` (n'importe où dans le
    // document — barre de progression, jauge, poignée survolée…) le repousserait
    // indéfiniment et la fenêtre native ne reviendrait JAMAIS. Un « il ne s'affiche plus »
    // est infiniment pire que le décalage qu'on corrige ici, donc la suppression est
    // plafonnée : passé `MAX_ANIM_HIDE_MS` depuis le DÉBUT de la rafale, on cesse de la
    // prolonger et l'overlay revient, quitte à traîner un peu.
    let animStart = 0;
    const onTransition = (e: TransitionEvent) => {
      if (e.propertyName !== "width") return;
      const now = performance.now();
      if (!resizing) animStart = now;
      else if (now - animStart > MAX_ANIM_HIDE_MS) return;
      onWindowResize();
    };
    const tick = () => {
      // Detect an app-window MOVE — no DOM 'move' event exists, so watch the on-screen
      // origin. It changes on a move while the viewport rect does NOT; the overlay lives
      // in screen coords, so a move must resend. Hide-then-snap like a resize.
      const sx = window.screenX;
      const sy = window.screenY;
      const screenKey = `${sx},${sy}`;
      if (screenKey !== lastScreen) {
        lastScreen = screenKey;
        moving = true;
        forceResend();
        window.clearTimeout(moveT);
        moveT = window.setTimeout(() => {
          moving = false;
        }, 160);
      }
      // Visible only while NO modal is open AND the window isn't mid-resize/-move — the
      // native window would otherwise cover a modal or sit stale over the reflowing/
      // moving panel. Re-evaluated each frame so it flips within ~16ms with no race.
      const wantVisible = !shouldHideAgentBrowser() && !resizing && !moving;
      if (wantVisible && !shown) {
        shown = true;
        // Force a bounds resend once the (re)shown window exists — the earliest
        // setBounds were dropped while it was hidden / not yet spawned.
        void browser.show().then(() => {
          last = "";
        });
      } else if (!wantVisible && shown) {
        shown = false;
        void browser.hide();
      }
      if (shown) {
        const el = viewportRef.current;
        if (el) {
          const r = el.getBoundingClientRect();
          // The screen origin (sx,sy) is part of the key: moving the window changes the
          // target SCREEN bounds even though the viewport rect is unchanged.
          // L'ÉPOQUE fait partie de la clé : l'AUTRE propriétaire de la visibilité peut
          // avoir remonté la fenêtre sans que ce rectangle change (`modalGate.ts`).
          const key = `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)},${sx},${sy},${agentBrowserBoundsEpoch()}`;
          if (r.width > 0 && r.height > 0 && key !== last) {
            last = key;
            void browser.setBounds({ x: r.x, y: r.y, width: r.width, height: r.height });
          }
        }
      }
      if (alive) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // A ResizeObserver re-arms the send when the viewport itself resizes (covers a
    // throttled frame during a layout change); the window `resize` listener additionally
    // hides-then-resnaps for an app-window resize (see onWindowResize).
    const el = viewportRef.current;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(forceResend) : null;
    if (el && ro) ro.observe(el);
    window.addEventListener("resize", onWindowResize);
    // `transitionrun` couvre le DÉBUT (avant la première trame animée) et `transitionend`
    // la FIN — chacun ré-arme le minuteur de 160 ms, donc l'overlay reste caché du premier
    // au dernier pixel de l'animation, puis se recale sur le rectangle définitif.
    document.addEventListener("transitionrun", onTransition, true);
    document.addEventListener("transitionend", onTransition, true);

    // While the app window is HIDDEN (minimised / another Space / occluded) there's
    // nothing to track — stop the per-frame rAF entirely (no getBoundingClientRect /
    // modal query burning CPU behind the scenes), and hide the native `alwaysOnTop`
    // agent window so it doesn't float over OTHER apps. Resume on re-show, forcing a
    // fresh bounds resend (the shown-state is re-derived by the first tick).
    const onVisibility = () => {
      if (document.hidden) {
        alive = false;
        cancelAnimationFrame(raf);
        shown = false;
        void browser.hide();
      } else if (!alive) {
        alive = true;
        forceResend();
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.clearTimeout(resizeT);
      window.clearTimeout(moveT);
      ro?.disconnect();
      window.removeEventListener("resize", onWindowResize);
      document.removeEventListener("transitionrun", onTransition, true);
      document.removeEventListener("transitionend", onTransition, true);
      document.removeEventListener("visibilitychange", onVisibility);
      void browser.hide();
    };
  }, [browser, viewportRef]);
}
