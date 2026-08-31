import { useEffect, useRef, useState } from "react";
import { useHost, type BrowserHost } from "../../../host";
import { MessageIcon, ShieldIcon } from "../../../components/brand";
import { useAgentBrowserOffline } from "../../../hooks/useMcpConnectedIds";
import { BookmarksBar } from "./BookmarksBar";
import { BrowserPlaceholder } from "./BrowserPlaceholder";
import { VbBar } from "./VbChrome";
import {
  askPageDraft,
  resolveTarget,
  sameUrl,
  type BrowserBookmark,
} from "./browserTarget";
import { useBrowserBounds } from "./useBrowserBounds";

import { useT } from "../../../i18n";
/** A request to open a URL in the panel (from a clicked conversation link). The nonce
 *  makes re-opening the SAME url fire again (a plain url prop wouldn't re-trigger). */
export interface BrowserNavRequest {
  url: string;
  nonce: number;
}

let SEQ = 1;
/** One panel tab — url/title/loading/history come from the child's report. */
type Tab = import("./VbChrome").VbTab;

/**
 * Split-screen browser panel. Reproduces the design's browser chrome (tab strip,
 * URL bar, reload, close, redaction note) as DOM, and hosts the REAL agent-browser
 * window as a native overlay pinned to `.browser-viewport` (see `useBrowserBounds`).
 *
 * MULTI-TAB: when the Host exposes `onTabs` + `tabNew/tabSelect/tabClose` (desktop), the
 * strip mirrors the child's REAL persistent tabs (each a live `WebContentsView` = a CDP
 * target the model can drive too); switching is INSTANT (no reload). Operations drive the
 * child, which re-reports the authoritative tab list. Without those (un-restarted preload),
 * it falls back to a UI-only single-window model (re-navigate on switch). A non-URL query
 * searches instead of failing.
 */
export function BrowserPanel({
  browser,
  onClose,
  navRequest,
  onNavConsumed,
  automationNonce,
  driving,
  searchEngine,
  onSearchEngineChange,
  bookmarks,
  onAsk,
  embedded,
  overlayActive,
}: {
  browser: BrowserHost | undefined;
  onClose: () => void;
  /** App-level "the model is driving this turn" (persists for the whole turn, not a
   *  per-action blink). Drives the native drive-halo overlay + the accent, dimmed while
   *  the user has taken over. Undefined ⇒ fall back to the per-action nonce. */
  driving?: boolean;
  /** The chosen integrated-browser search engine (`Settings.browserSearchEngine`);
   *  a free-text URL-bar query searches on it. Undefined ⇒ the default (DuckDuckGo). */
  searchEngine?: string;
  /** Persist a new engine choice (updates the setting). */
  onSearchEngineChange?: (id: string) => void;
  /** The user's bookmarks row (`Settings.browserBookmarks`). ⚠️ READ-ONLY now: the star
   *  that added one is gone (« Demander » took its place), so the row shows what a
   *  previous version saved and navigates to it — nothing writes the list any more. */
  bookmarks?: BrowserBookmark[];
  /** « Demander »: receives the DRAFT already written (`askPageDraft`) and opens it in the
   *  current conversation — the page owns its vocabulary, the shell the conversation
   *  (a `containers/` doesn't import into `pages/`). Absent ⇒ no button. */
  onAsk?: (draft: string) => void;
  /** A conversation link the user chose to open in the integrated browser — opens a
   *  NEW tab, or re-focuses the existing tab already showing that URL. */
  navRequest?: BrowserNavRequest;
  /** Cleared after the request is handled so re-opening the panel (via the toolbar
   *  toggle) doesn't replay a stale link on remount. */
  onNavConsumed?: () => void;
  /** Monotonic nonce bumped whenever the MODEL starts a browser tool call — drives the
   *  "automation in progress" banner + the active-tab accent. Cleared when the user
   *  takes over (types a URL, switches/opens a tab). */
  automationNonce?: number;
  /** PANE-EMBEDDED mode (unified tabs): the pane's strip already lists the browser
   *  tabs, so the panel hides its OWN strip; the native overlay binds only when
   *  `overlayActive` (the focused pane) — ONE native window, one bounds writer. */
  embedded?: boolean;
  overlayActive?: boolean;
}) {
  const t = useT();
  const host = useHost();
  const viewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Real multi-tab when the Host drives actual child views; else the local fallback.
  const realTabs = !!(browser?.onTabs && browser.tabNew && browser.tabSelect && browser.tabClose);
  const [tabs, setTabs] = useState<Tab[]>(realTabs ? [] : [{ id: "t0", url: "" }]);
  const [activeId, setActiveId] = useState(realTabs ? "" : "t0");
  const [input, setInput] = useState("");
  // "The model is driving this browser right now." Base signal is the app-level `driving`
  // (persists for the WHOLE turn — no per-action blink); the user grabbing control dims it
  // until the model's NEXT browser action re-asserts (a fresh `automationNonce`). Falls back
  // to the raw nonce for an older host that doesn't pass `driving`.
  const [tookOver, setTookOver] = useState(false);
  const userTookOver = () => setTookOver(true);
  useEffect(() => {
    if (automationNonce) setTookOver(false); // a new model action → model is driving again
  }, [automationNonce]);
  const automating = !!driving && !tookOver;
  // Tell main when the model is driving → it floats the native drive-halo overlay OVER the
  // browser window (a DOM element can't — the native window has no z-order). Cleared on
  // unmount so the halo never lingers. No-op where the host lacks `setDriving`.
  // ⚠️ This is NOW the only "the model is driving" signal for this panel: the text
  // chip that used to double the border was removed. `automating` therefore stays load-bearing —
  // removing it would kill the halo, not just a sentence.
  useEffect(() => {
    void browser?.setDriving?.(automating);
  }, [automating, browser]);
  useEffect(() => () => void browser?.setDriving?.(false), [browser]);
  // THE SAME definition as the global gate (`hooks/useMcpConnectedIds.ts`) — the two
  // owners of this window can no longer diverge.
  const offline = useAgentBrowserOffline();
  // No browser ⇒ no bounds ⇒ the native window stays down. An UNFOCUSED embedded pane
  // must not fight the focused one for the single overlay; and ⚠️ DISCONNECTED, this
  // `alwaysOnTop` window would hide « Activer » — invisible AND out of the click's reach.
  useBrowserBounds(overlayActive === false || offline ? undefined : browser, viewportRef);

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const inputFocused = () => document.activeElement === inputRef.current;

  // Real tabs: mirror the child's authoritative list (opened by the user, a page's
  // window.open, or the MODEL over CDP). The URL bar tracks the active tab unless typing.
  useEffect(() => {
    if (!browser?.onTabs) return;
    return browser.onTabs((rep) => {
      setTabs(
        rep.map((t) => ({
          id: t.id,
          url: t.url,
          title: t.title,
          loading: t.loading,
          canGoBack: t.canGoBack,
          canGoForward: t.canGoForward,
        })),
      );
      const act = rep.find((t) => t.active);
      if (act) {
        setActiveId(act.id);
        if (!inputFocused()) setInput(act.url);
      }
    });
  }, [browser]);

  const navigate = (url: string) => {
    if (realTabs) {
      if (!inputFocused()) setInput(url);
      void browser!.navigate(url, activeIdRef.current || undefined);
      return;
    }
    setTabs((ts) => ts.map((t) => (t.id === activeIdRef.current ? { ...t, url } : t)));
    setInput(url);
    void browser?.navigate(url);
  };
  const go = (raw: string) => {
    userTookOver();
    const url = resolveTarget(raw, searchEngine);
    if (url && browser) navigate(url);
  };
  const selectTab = (id: string) => {
    userTookOver();
    if (realTabs) {
      void browser!.tabSelect!(id);
      return;
    }
    const t = tabsRef.current.find((x) => x.id === id);
    if (!t) return;
    setActiveId(id);
    setInput(t.url);
    if (t.url) void browser?.navigate(t.url);
  };
  // (Tab NEW/CLOSE live on the right rail now — it drives the child directly.)

  // Open a conversation link: re-focus a tab already showing it, else reuse the active
  // BLANK tab, else a NEW tab. (Real tabs drive the child; fallback mutates locally.)
  const openUrlInTab = (rawUrl: string) => {
    const url = resolveTarget(rawUrl, searchEngine) ?? rawUrl;
    const existing = tabsRef.current.find((t) => sameUrl(t.url, url));
    if (existing) {
      selectTab(existing.id);
      return;
    }
    const activeTab = tabsRef.current.find((t) => t.id === activeIdRef.current);
    if (realTabs) {
      if (activeTab && !activeTab.url) void browser!.navigate(url, activeTab.id);
      else void browser!.tabNew!(url);
      return;
    }
    if (activeTab && !activeTab.url) {
      setTabs((ts) => ts.map((t) => (t.id === activeTab.id ? { ...t, url } : t)));
      setInput(url);
      void browser?.navigate(url);
      return;
    }
    const id = `t${SEQ++}`;
    setTabs((ts) => [...ts, { id, url }]);
    setActiveId(id);
    setInput(url);
    void browser?.navigate(url);
  };

  // A new nav request (a clicked conversation link) → open/focus its tab. Keyed on the
  // nonce so re-clicking the same link re-fires (and re-focuses its tab).
  useEffect(() => {
    if (!navRequest?.url) return;
    openUrlInTab(navRequest.url);
    onNavConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navRequest?.nonce]);

  return (
    <div className={`browser-pane${embedded ? " embedded" : ""}`} aria-label={t.conversation.browser.pane}>
      {/* NO tab strip: the RIGHT RAIL is the browser's tab surface (kit) — one
          rail entry per real web tab. The bar keeps the whole chrome. */}
      <VbBar
        active={active}
        input={input}
        inputRef={inputRef}
        onInput={setInput}
        onGo={() => go(input)}
        // History nav needs the desktop child (host `goBack`); hidden otherwise.
        onBack={
          browser?.goBack
            ? () => {
                userTookOver();
                void browser.goBack?.();
              }
            : undefined
        }
        onForward={
          browser?.goForward
            ? () => {
                userTookOver();
                void browser.goForward?.();
              }
            : undefined
        }
        onReload={() => active?.url && go(active.url)}
        searchEngine={searchEngine}
        onSearchEngineChange={onSearchEngineChange}
        onClose={onClose}
      />
      {/* Live page-load progress — the kit's 2px brand sweep under the bar. */}
      {active?.loading && <div className="vb-progress" aria-hidden="true" />}

      {/* The native agent window is pinned over the INNER viewport (useBrowserBounds). The
          "the model is driving" HALO can't be a DOM element (the native window has no DOM
          z-order), so it's a separate MAIN-owned transparent, click-through overlay window
          floated over it (via `browser.setDriving`, wired in the effect above). This wrapper
          is just the layout box; the placeholder shows through until the overlay covers it. */}
      <div className="vb-halo-frame">
        <div className="browser-viewport" ref={viewportRef}>
          <BrowserPlaceholder
            hasBrowser={!!browser}
            offline={offline}
            onConnect={() => Promise.resolve(host.mcp?.enableBrowser?.())}
          />
        </div>
      </div>

      <BookmarksBar
        bookmarks={bookmarks ?? []}
        currentUrl={active?.url ?? ""}
        onOpen={(url) => {
          userTookOver();
          if (browser) navigate(url);
        }}
      />
      {/* This footer used to carry a reassurance sentence — true, but inert: it permanently
          repeated what the app does everywhere, on the one strip where an ACTION belonged. */}
      <div className="vb-note">
        {onAsk && active?.url ? (
          <button
            type="button"
            className="vb-ask"
            title={t.conversation.browser.askAboutPage}
            onClick={() => onAsk(askPageDraft({ url: active.url, title: active.title }))}
          >
            <MessageIcon size={13} /> {t.conversation.browser.askAboutPageLabel}
          </button>
        ) : (
          <>
            <ShieldIcon size={13} /> <span>{t.conversation.browser.embedded}</span>
          </>
        )}
      </div>
    </div>
  );
}
