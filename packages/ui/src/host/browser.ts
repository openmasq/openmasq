/**
 * Live view/control of the agent browser — the isolated Chromium (a SEPARATE,
 * app-owned Electron window) the model drives over CDP. Powers the split-screen
 * browser panel: the panel measures its viewport and calls `setBounds` so the
 * native window overlays exactly that rectangle, plus a URL bar (`navigate`) and
 * show/hide as the panel opens/closes. Desktop-only (no window to overlay in the
 * browser preview → the Host omits it and the split toggle stays hidden).
 */
export interface BrowserHost {
  /** `enabled` = opted-in; `running` = the isolated process is up with a CDP
   *  endpoint. Best-effort — the panel shows regardless. */
  status(): Promise<{ enabled: boolean; running: boolean; cdpEndpoint: string | null }>;
  /** Spawn (if needed) + show the agent window. */
  show(): Promise<void>;
  /** Hide the agent window (keeps the process running). */
  hide(): Promise<void>;
  /** Point a tab at a URL (the active tab, or `tabId`; http/https only; spawns the
   *  browser + a tab if needed). */
  navigate(url: string, tabId?: string): Promise<void>;
  /** Session-history navigation on the ACTIVE tab — strictly weaker than `navigate`
   *  (history entries already passed the child's SSRF guards when first loaded).
   *  Absent on an un-restarted preload / non-desktop → the panel hides the buttons. */
  goBack?(): Promise<void>;
  goForward?(): Promise<void>;
  /** Open a NEW tab (optionally at `url`). Multi-tab: a real persistent page/view. */
  tabNew?(url?: string): Promise<void>;
  /** Make `tabId` the active (visible) tab — instant, the page stays alive. */
  tabSelect?(tabId: string): Promise<void>;
  /** Close a tab (its page/view is destroyed; the browser keeps ≥1 tab). */
  tabClose?(tabId: string): Promise<void>;
  /** Overlay the native window onto this VIEWPORT rectangle (CSS px, relative to
   *  the renderer viewport). The desktop Host translates it to screen coordinates. */
  setBounds(rect: { x: number; y: number; width: number; height: number }): Promise<void>;
  /** Signal that the model is DRIVING the browser right now, so the platform can float a
   *  "piloting" halo OVER the native window (a renderer element can't — no DOM z-order).
   *  Absent on an un-restarted preload / non-desktop → no halo, feature degrades silently. */
  setDriving?(on: boolean): Promise<void>;
  /** Subscribe to the agent browser's full TAB list as it changes — a tab opened/
   *  closed/selected/navigated, by the human OR the MODEL over CDP — so the panel
   *  mirrors the REAL tabs 1:1. Returns an unsubscribe. Absent on an un-restarted
   *  preload / non-desktop → the panel falls back to its local single-tab model. */
  onTabs?(
    cb: (
      tabs: Array<{
        id: string;
        url: string;
        title: string;
        active: boolean;
        /** The tab the MODEL is currently driving (its dedicated agent tab) — so the drive
         *  indicator follows the PILOTED tab, not the visible one. Absent on an older child. */
        agent?: boolean;
        /** Live page-load state (progress bar) — absent on an older child. */
        loading?: boolean;
        /** Session-history availability (nav buttons) — absent on an older child. */
        canGoBack?: boolean;
        canGoForward?: boolean;
        /** The site favicon as a raster `data:` URL (fetched hardened + SSRF-guarded in
         *  main, never a remote URL — CSP). Absent → the panel shows a letter tile. */
        favicon?: string;
      }>,
    ) => void,
  ): () => void;
  /** App shortcuts the agent window intercepted while it had OS keyboard focus (e.g.
   *  `"cmd-k"`) — so the ⌘K palette still opens while the user is driving the browser.
   *  Returns an unsubscribe. Absent on an un-restarted preload / non-desktop. */
  onShortcut?(cb: (name: string) => void): () => void;
}
