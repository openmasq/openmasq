import { useEffect, useRef, type ReactNode } from "react";
import { useT } from "../i18n";
import { createPortal } from "react-dom";
import { BrowserIcon, ArrowRightIcon } from "./brand";
import { useLinkOpen } from "../containers/providers/linkOpen";
import { usePopover } from "../hooks/usePopover";

// A menu over a message link letting the user choose WHERE to open it: the
// split-screen integrated agent-browser (`openInBrowser`, desktop only) or an
// EXTERNAL browser (`window.open` → the main window-open handler → shell.openExternal).
// Open/dismiss/placement ride `usePopover` (THE menu primitive: Escape, outside
// mousedown, close-on-scroll, portaled fixed placement); this file only adds the
// HOVER affordance on top — a small open delay + a close grace period let the pointer
// travel from the link into the menu without it vanishing — and the keyboard path:
// focusing the link opens the menu, ArrowDown enters it, Escape hands focus back.
// A plain click on the link still opens external (unchanged), so the menu is purely
// an added affordance.

const OPEN_DELAY = 260; // ms hover before the menu appears (no flicker on a quick pass)
const CLOSE_DELAY = 160; // ms grace so moving link→menu doesn't dismiss it
const MENU_WIDTH = 220; // px — matches the CSS min-width plus its padding

export function LinkOpenMenu({ href, children }: { href: string; children: ReactNode }) {
  const t = useT();
  const { openInBrowser } = useLinkOpen();
  const menu = usePopover<HTMLSpanElement, HTMLDivElement>({
    anchor: { gap: 4, margin: 8, width: MENU_WIDTH, desiredHeight: 84, align: "left" },
  });
  const openT = useRef<number | undefined>(undefined);
  const closeT = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(openT.current);
      window.clearTimeout(closeT.current);
    },
    [],
  );

  const show = () => {
    window.clearTimeout(closeT.current);
    if (menu.open) return;
    openT.current = window.setTimeout(() => menu.setOpen(true), OPEN_DELAY);
  };
  const scheduleClose = () => {
    window.clearTimeout(openT.current);
    closeT.current = window.setTimeout(menu.close, CLOSE_DELAY);
  };
  const cancelClose = () => window.clearTimeout(closeT.current);

  /** The focusable link inside the wrapper — where Escape hands focus back. */
  const focusLink = () => {
    const a = menu.triggerRef.current?.querySelector("a");
    (a ?? menu.triggerRef.current)?.focus();
  };
  const focusItem = (dir: 1 | -1) => {
    const items = [...(menu.menuRef.current?.querySelectorAll("button") ?? [])];
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + dir + items.length) % items.length]?.focus();
  };

  const openExternal = () => {
    menu.close();
    window.open(href, "_blank", "noreferrer");
  };
  const openIntegrated = () => {
    menu.close();
    openInBrowser?.(href);
  };

  return (
    <span
      ref={menu.triggerRef}
      className="md-link-hoverwrap"
      onMouseEnter={show}
      onMouseLeave={scheduleClose}
      // Keyboard path: reaching the link (Tab) opens the menu at once — the hover
      // delay only exists to absorb a pointer passing through. Gated on
      // `:focus-visible` so the focus a plain CLICK gives the link doesn't pop the
      // menu (the mouse UX stays hover-delay + click-opens-external, unchanged).
      onFocus={(e) => {
        cancelClose();
        let keyboard = true;
        try {
          keyboard = (e.target as Element).matches(":focus-visible");
        } catch {
          /* selector unsupported (old jsdom) — err on the side of opening */
        }
        if (keyboard) menu.setOpen(true);
      }}
      onBlur={(e) => {
        // The menu is PORTALED, so focus moving into it looks like leaving the
        // wrapper — only close when focus truly went elsewhere.
        const next = e.relatedTarget as Node | null;
        if (next && menu.menuRef.current?.contains(next)) return;
        menu.close();
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" && menu.open) {
          e.preventDefault();
          menu.menuRef.current?.querySelector("button")?.focus();
        }
      }}
    >
      {children}
      {menu.open &&
        menu.style &&
        createPortal(
          <div
            ref={menu.menuRef}
            className="md-link-menu"
            role="menu"
            aria-label={t.menus.link.ariaLabel}
            // Runtime-computed position (portal to body) — the allowed inline-style case.
            style={menu.style}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onKeyDown={(e) => {
              // usePopover's document-capture listener already closes on Escape;
              // this only returns focus to the link so the keyboard user isn't dropped.
              if (e.key === "Escape") focusLink();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                focusItem(1);
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                focusItem(-1);
              }
            }}
          >
            {openInBrowser && (
              <button type="button" role="menuitem" className="md-link-menu-btn" onClick={openIntegrated}>
                <BrowserIcon size={14} /> {t.menus.link.integratedBrowser}
              </button>
            )}
            <button type="button" role="menuitem" className="md-link-menu-btn" onClick={openExternal}>
              <ArrowRightIcon size={14} /> {t.menus.link.externalBrowser}
            </button>
          </div>,
          document.body,
        )}
    </span>
  );
}
