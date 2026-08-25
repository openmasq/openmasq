import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

/**
 * THE popover/menu primitive: open state, dismissal, and (optionally) fixed-viewport
 * placement for a menu portaled out of a clipping ancestor.
 *
 * It exists because the same two effects had been hand-written NINE times
 * (`DownloadMenu`, `HueSelect`, `DocViewMenu`, `SearchEngineMenu`, `MarkKeepMenu`,
 * `ChatHeader`, `Composer`, `AttachmentPreviewModal`, `Memory/parts`), and the copies had
 * already drifted in ways that are invisible until they bite: some listened on `window`
 * and some on `document`, some in the capture phase and some not, some closed on scroll
 * and some let a fixed menu float away from its trigger. A dismissal that works in eight
 * places and not the ninth reads as "this one menu is broken", never as "these are the
 * same thing".
 *
 * ⚠️ Dismissal listens on **`mousedown`, not `click`**: a menu item that unmounts its own
 * trigger (or re-renders the row under the cursor) never delivers the `click`, so the
 * menu would stay open. And the outside test must consult BOTH refs — the trigger too,
 * or clicking the trigger to close it immediately reopens it.
 */

export interface PopoverAnchor {
  /** px between the trigger and the menu. */
  gap?: number;
  /** px kept clear of the viewport edges. */
  margin?: number;
  /** Menu width: a px number, or "trigger" to match the trigger's own width. */
  width?: number | "trigger";
  /** The height the menu would LIKE. Decides whether to flip above; never clamps
   *  unless `clampHeight` is set. */
  desiredHeight?: number;
  /** Which trigger edge the menu aligns to. */
  align?: "left" | "right";
  /** Cap the menu's height to the space actually available (a long option list).
   *  Off by default: a short menu should never grow a scrollbar it doesn't need. */
  clampHeight?: boolean;
  /** Floor for the clamped height, so a cramped viewport still shows something. */
  minHeight?: number;
}

const DEFAULTS = { gap: 6, margin: 8, desiredHeight: 200, align: "left" as const, minHeight: 120 };

export interface PopoverApi<T extends HTMLElement, M extends HTMLElement> {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  close: () => void;
  /** Put this on the trigger — the outside-click test needs it. */
  triggerRef: RefObject<T>;
  /** Put this on the menu — likewise. */
  menuRef: RefObject<M>;
  /**
   * `position: fixed` style for a PORTALED menu. `null` when `anchor` is off, or for
   * the one frame before placement is measured — render nothing until it is non-null,
   * or the menu flashes at (0,0).
   */
  style: CSSProperties | null;
}

export function usePopover<T extends HTMLElement = HTMLElement, M extends HTMLElement = HTMLElement>(
  opts: {
    /** Placement config for a portaled menu. Omit for an in-flow menu (the common
     *  `.menu-anchor` dropdown): you then get open state + dismissal only. */
    anchor?: PopoverAnchor;
    /** Close when the page scrolls or the window resizes. Defaults to TRUE for an
     *  anchored menu — a `fixed` popover would otherwise stay put while the content
     *  scrolls out from under it — and false for an in-flow one, which moves with its
     *  container and has no reason to close. */
    closeOnScroll?: boolean;
    /** Called after the popover closes for any reason (Escape, outside click, scroll). */
    onClose?: () => void;
  } = {},
): PopoverApi<T, M> {
  const { anchor, onClose } = opts;
  const closeOnScroll = opts.closeOnScroll ?? !!anchor;
  const [open, setOpenState] = useState(false);
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<T>(null);
  const menuRef = useRef<M>(null);
  // Kept in a ref so the dismissal effect doesn't re-subscribe when the caller passes
  // a fresh closure every render (every caller does).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const setOpen = useCallback((v: boolean) => {
    setOpenState((cur) => {
      if (cur === v) return cur;
      if (!v) onCloseRef.current?.();
      return v;
    });
  }, []);
  const close = useCallback(() => setOpen(false), [setOpen]);
  const toggle = useCallback(() => setOpenState((o) => {
    if (o) onCloseRef.current?.();
    return !o;
  }), []);

  // ── Placement (anchored menus only) ──────────────────────────────────────────
  // Measured in a LAYOUT effect: the menu is portaled and fixed, so placing it after
  // paint would show it at the wrong spot for a frame.
  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const el = triggerRef.current;
    if (!el) return;
    const cfg = { ...DEFAULTS, ...anchor };
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = vh - r.bottom - cfg.gap - cfg.margin;
    const above = r.top - cfg.gap - cfg.margin;
    // Flip only when there is genuinely less room below AND more above — a menu that
    // flips on a tie jumps around as the window resizes.
    const openUp = below < cfg.desiredHeight && above > below;
    const width = cfg.width === "trigger" || cfg.width === undefined ? r.width : cfg.width;
    const left =
      cfg.align === "right"
        ? Math.max(cfg.margin, Math.min(r.right - width, vw - width - cfg.margin))
        : Math.max(cfg.margin, Math.min(r.left, vw - width - cfg.margin));
    setStyle({
      position: "fixed",
      left,
      width,
      ...(cfg.clampHeight
        ? { maxHeight: Math.max(cfg.minHeight, Math.min(cfg.desiredHeight, openUp ? above : below)) }
        : {}),
      ...(openUp ? { bottom: vh - r.top + cfg.gap } : { top: r.bottom + cfg.gap }),
    });
    // `anchor` is a fresh object literal at every call site; re-running placement on
    // its identity would loop. Placement depends on `open` and the live rect only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Drop the stale placement on close, so the next open cannot paint the old position
  // for a frame before the layout effect re-measures.
  useEffect(() => {
    if (!open) setStyle(null);
  }, [open]);

  // ── Dismissal (every popover) ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // CAPTURE phase: a menu item's own handler may stopPropagation, and an overlay
    // between us and the document would otherwise swallow the outside click.
    document.addEventListener("mousedown", away, true);
    document.addEventListener("keydown", key, true);
    if (closeOnScroll) {
      window.addEventListener("scroll", close, true); // capture: any scroller, not just window
      window.addEventListener("resize", close);
    }
    return () => {
      document.removeEventListener("mousedown", away, true);
      document.removeEventListener("keydown", key, true);
      if (closeOnScroll) {
        window.removeEventListener("scroll", close, true);
        window.removeEventListener("resize", close);
      }
    };
  }, [open, closeOnScroll, setOpen, close]);

  return { open, setOpen, toggle, close, triggerRef, menuRef, style };
}
