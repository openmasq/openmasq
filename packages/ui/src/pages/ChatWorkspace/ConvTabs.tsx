import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { ProviderId } from "@openmasq/llm";
import { ModelLogo, MessageIcon, PlusIcon, XIcon, LayoutSplitIcon, BrowserIcon, FileIcon } from "../../components/brand";
import { useT } from "../../i18n";
import { useWorkspaceDnd } from "../../workspace";

export interface ConvTab {
  id: string;
  title: string;
  provider?: ProviderId;
  modelId?: string;
  /** The conversation is generating a reply — show a spinner in place of the logo
   *  (like a browser tab loading), so a busy thread is visible from any other tab. */
  busy?: boolean;
  /** Kit tab KINDS: a browser or file tab in the same strip (globe/file icon, tinted
   *  marker). Absent = a chat conversation. Non-chat tabs carry the FULL ref as `id`
   *  and are not draggable (their lifecycle isn't the conversation DnD's). */
  kind?: "browser" | "file";
}

/**
 * Browser-style conversation tabs — one tab per OPEN conversation, at the top of
 * the chat webview (above the split). Each shows the model's real vendor logo +
 * title + a close button; the trailing "+" opens a new chat. The active tab is
 * the store's active conversation. Pure presentation — all state lives in the
 * redux `openTabIds` + the store's `activeId`.
 */
export function ConvTabs({
  tabs,
  activeId,
  onSelect,
  onClose,
  onNew,
  onTabPointerDown,
  onSplitTab,
}: {
  tabs: ConvTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  /** In the tiling workspace, a pointerdown on a tab starts a pointer-based drag
   *  (move/split) and selection routes through it; absent (single pane) = plain click. */
  onTabPointerDown?: (id: string, e: ReactPointerEvent) => void;
  /** Split this pane putting the tab in a NEW pane on the given side (row split).
   *  When set AND the pane has ≥2 tabs, hovering a tab reveals a "Diviser à gauche /
   *  droite" menu — making the drag-to-split gesture discoverable. */
  onSplitTab?: (id: string, side: "left" | "right") => void;
}) {
  const t = useT();
  // Hover-reveal split menu: a short dwell on a tab pops a light dropdown offering to
  // put it in a split pane left/right. Portaled + fixed-positioned so the tab strip's
  // `overflow-x` scroller can't clip it. Only meaningful when a pane holds ≥2 tabs
  // (splitting a lone tab off its own pane is a no-op), so it's gated on that below.
  const canSplit = !!onSplitTab && tabs.length >= 2;
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const openT = useRef<number | null>(null);
  const closeT = useRef<number | null>(null);
  const clearTimers = () => {
    if (openT.current) window.clearTimeout(openT.current);
    if (closeT.current) window.clearTimeout(closeT.current);
    openT.current = closeT.current = null;
  };
  useEffect(() => {
    return clearTimers; // cleanup on unmount, returned ON PURPOSE
  }, []);
  const scheduleOpen = (id: string, el: HTMLElement) => {
    if (!canSplit) return;
    if (closeT.current) window.clearTimeout(closeT.current), (closeT.current = null);
    if (openT.current) window.clearTimeout(openT.current);
    openT.current = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      setMenu({ id, x: r.left, y: r.bottom });
    }, 480);
  };
  const scheduleClose = () => {
    if (openT.current) window.clearTimeout(openT.current), (openT.current = null);
    if (closeT.current) window.clearTimeout(closeT.current);
    closeT.current = window.setTimeout(() => setMenu(null), 180);
  };
  const cancelClose = () => {
    if (closeT.current) window.clearTimeout(closeT.current), (closeT.current = null);
  };
  // Progressive opacity relative to the CURRENT conversation: the active tab is
  // full-strength and the others fade the further they sit from it (a gentle focus
  // falloff). Only the computed value rides inline (a CSS var); the `opacity` +
  // the hover/active overrides live in CSS. Floored so a distant busy tab's
  // spinner stays visible.
  const activeIndex = tabs.findIndex((t) => t.id === activeId);
  const tabOpacity = (i: number): number => {
    if (activeIndex < 0) return 1;
    return Math.max(0.45, 1 - Math.abs(i - activeIndex) * 0.15);
  };
  // The tab being dragged renders as the hole its ghost was lifted out of. Null when
  // there is no DnD provider (single pane / mobile) — the supported state.
  const draggingId = useWorkspaceDnd()?.drag?.conv ?? null;
  // Overflow indicator: with many tabs the strip scrolls, and nothing said more
  // exist — count the tabs fully OUT of the viewport and show a « +N » pill that
  // scrolls toward them. Recomputed on scroll/resize/tab-set changes.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const recount = () => {
      const { scrollLeft, clientWidth } = el;
      let n = 0;
      for (const child of el.children) {
        if (!(child instanceof HTMLElement) || child.getAttribute("role") !== "tab") continue;
        const left = child.offsetLeft - el.offsetLeft;
        if (left + child.offsetWidth <= scrollLeft + 4 || left >= scrollLeft + clientWidth - 4) n++;
      }
      setHidden(n);
    };
    recount();
    el.addEventListener("scroll", recount, { passive: true });
    const ro = new ResizeObserver(recount);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", recount);
      ro.disconnect();
    };
  }, [tabs.length]);
  return (
    <div className="conv-tabs" role="tablist">
      <div className="conv-tabs-scroll" ref={scrollRef}>
        {/* `tab`, not `t`: in this component `t` is the translation catalogue. */}
        {tabs.map((tab, i) => {
          const on = tab.id === activeId;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={on}
              className={`conv-tab${on ? " on" : ""}${tab.id === draggingId ? " dragging" : ""}${tab.kind ? ` conv-tab--${tab.kind}` : ""}`}
              style={{ "--tab-op": tabOpacity(i) } as CSSProperties}
              onPointerDown={onTabPointerDown && !tab.kind ? (e) => onTabPointerDown(tab.id, e) : undefined}
              // In workspace mode selection rides the DRAG pointerdown — which non-chat
              // tabs deliberately don't get (their lifecycle isn't the conv DnD's). They
              // therefore keep a PLAIN CLICK, or the tab is dead (the reported bug).
              onClick={onTabPointerDown && !tab.kind ? undefined : () => onSelect(tab.id)}
              onMouseEnter={(e) => scheduleOpen(tab.id, e.currentTarget)}
              onMouseLeave={scheduleClose}
              title={tab.title}
            >
              <span className="conv-tab-ico">
                {tab.busy ? (
                  <span className="conv-tab-spin" aria-label={t.chat.generating} role="status" />
                ) : tab.kind === "browser" ? (
                  <BrowserIcon size={15} />
                ) : tab.kind === "file" ? (
                  <FileIcon size={15} />
                ) : tab.provider ? (
                  // `tile` so monochrome vendor marks (kimi/grok/…) stay
                  // visible on the light tab — they're drawn for their brand tile.
                  <ModelLogo provider={tab.provider} modelId={tab.modelId} size={17} tile />
                ) : (
                  <MessageIcon size={14} />
                )}
              </span>
              <span className="conv-tab-label">{tab.title}</span>
              <button
                className="conv-tab-x"
                aria-label={t.chat.closeTab}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
              >
                <XIcon size={12} />
              </button>
            </div>
          );
        })}
        {/* "+" sits INSIDE the scroll, right after the last tab, so it always
            hugs the rightmost tab (and scrolls with them) instead of being pinned
            to the far edge of the bar. */}
        <button
          className="conv-tab-new"
          aria-label={t.chrome.newChat}
          title={t.chrome.newChat}
          onClick={onNew}
        >
          <PlusIcon size={16} />
        </button>
      </div>
      {hidden > 0 && (
        <button
          type="button"
          className="conv-tabs-more"
          title={t.chat.hiddenTabsTip(hidden)}
          aria-label={t.chat.hiddenTabs(hidden)}
          onClick={() => {
            const el = scrollRef.current;
            if (!el) return;
            // Toward whichever side hides more; a second click keeps going.
            const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
            el.scrollBy({ left: atEnd ? -el.clientWidth : el.clientWidth, behavior: "smooth" });
          }}
        >
          +{hidden}
        </button>
      )}
      {menu &&
        canSplit &&
        createPortal(
          <div
            className="conv-tab-split-menu"
            role="menu"
            style={{ left: menu.x, top: menu.y + 4 } as CSSProperties}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <div className="conv-tab-split-head">{t.chat.splitScreen}</div>
            <button
              role="menuitem"
              className="conv-tab-split-item"
              onClick={() => {
                onSplitTab?.(menu.id, "left");
                setMenu(null);
              }}
            >
              <LayoutSplitIcon size={15} />
              {t.chat.splitLeft}
            </button>
            <button
              role="menuitem"
              className="conv-tab-split-item"
              onClick={() => {
                onSplitTab?.(menu.id, "right");
                setMenu(null);
              }}
            >
              <span className="conv-tab-split-flip">
                <LayoutSplitIcon size={15} />
              </span>
              {t.chat.splitRight}
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
