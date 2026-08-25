import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Props } from "./types";
import { CHAR_BUDGET, ESTIMATE, OVERSCAN, PX_PER_CHAR, THRESHOLD, initialWindowSize } from "./sizing";

/** Large / heavy conversation → mount only the rows near the viewport, standing the
 *  rest up as two spacer divs. See `sizing.ts` for why the gate has two axes. */
export function Windowed<T>({
  items,
  scrollRef,
  getKey,
  children,
  apiRef,
  threshold,
  estimate,
  initialAnchor,
  sizeOf,
  charBudget,
}: Props<T>) {
  const count = items.length;
  const estPx = estimate ?? ESTIMATE;
  const initialWindow = initialWindowSize(
    items,
    sizeOf,
    threshold ?? THRESHOLD,
    charBudget ?? CHAR_BUDGET,
    initialAnchor ?? "top",
  );

  // Stable refs so `recompute` doesn't need `items`/`getKey` in its deps (which
  // would resubscribe the scroll listener every render).
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const getKeyRef = useRef(getKey);
  getKeyRef.current = getKey;
  // Also a ref: callers pass an inline arrow, and a new identity in `rowHeight`'s
  // deps would resubscribe the scroll listener on every render.
  const sizeOfRef = useRef(sizeOf);
  sizeOfRef.current = sizeOf;

  const heights = useRef<Map<string, number>>(new Map());
  const rows = useRef<Map<string, HTMLDivElement>>(new Map());
  const gap = useRef(0); // inter-message margin, read from the DOM once
  const [range, setRange] = useState(() =>
    initialAnchor === "bottom"
      ? { start: Math.max(0, count - initialWindow), end: count }
      : { start: 0, end: Math.min(count, initialWindow) },
  );
  // A message we've been asked to scroll to but whose row may not be mounted yet.
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  // A list opened at its BOTTOM (a chat thread at its latest message) must land there
  // BEFORE the first windowing recompute — otherwise recompute reads scrollTop=0 and
  // mounts the TOP rows: an expensive render of markdown bubbles (incl. the lazy
  // katex/lowlight first-load) that are immediately discarded when the parent scrolls
  // to the bottom — the ~1s lag opening a LARGE conversation. Runs once per mount,
  // defined FIRST so it precedes the recompute effects below. The parent keys this
  // component per conversation, so it re-anchors on every open.
  const anchored = useRef(false);
  useLayoutEffect(() => {
    if (anchored.current || initialAnchor !== "bottom") return;
    anchored.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [initialAnchor, scrollRef]);

  const rowHeight = useCallback(
    (i: number) => {
      const item = itemsRef.current[i];
      const h = heights.current.get(getKeyRef.current(item));
      if (h !== undefined) return h + gap.current;
      // Unmeasured: scale the guess by the item's size when we know it. A flat px
      // estimate is off by orders of magnitude for a folded document, which throws
      // the spacer heights — and therefore the window — badly out.
      const chars = sizeOfRef.current?.(item);
      const est = chars === undefined ? estPx : Math.max(estPx, chars * PX_PER_CHAR);
      return est + gap.current;
    },
    [estPx],
  );

  const recompute = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const n = itemsRef.current.length;
    const top = el.scrollTop;
    const viewport = el.clientHeight || 1;
    let acc = 0;
    let start = 0;
    while (start < n && acc + rowHeight(start) <= top) {
      acc += rowHeight(start);
      start++;
    }
    let end = start;
    let below = acc;
    while (end < n && below < top + viewport) {
      below += rowHeight(end);
      end++;
    }
    start = Math.max(0, start - OVERSCAN);
    end = Math.min(n, end + OVERSCAN);
    setRange((r) => (r.start === start && r.end === end ? r : { start, end }));
  }, [scrollRef, rowHeight]);

  // Imperative scroll-to-message. Jump the viewport to the target's ESTIMATED
  // offset (which mounts its row), then flag it pending so the measure pass below
  // centres it exactly once the real height is known.
  useLayoutEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      scrollToKey: (key: string) => {
        const idx = itemsRef.current.findIndex((it) => getKeyRef.current(it) === key);
        const el = scrollRef.current;
        if (idx < 0 || !el) return false;
        let offset = 0;
        for (let i = 0; i < idx; i++) offset += rowHeight(i);
        el.scrollTop = Math.max(0, offset - el.clientHeight * 0.35);
        setPendingKey(key);
        return true;
      },
    };
    return () => {
      if (apiRef) apiRef.current = null;
    };
  });

  // Once a pending target's row is actually mounted (after recompute), centre it
  // precisely and clear the request. Runs after every render, so refined heights
  // land it accurately.
  useLayoutEffect(() => {
    if (!pendingKey) return;
    const node = rows.current.get(pendingKey);
    if (node) {
      node.scrollIntoView({ block: "center" });
      setPendingKey(null);
    }
  });

  // Measure the mounted rows after each render; recompute if a height changed.
  useLayoutEffect(() => {
    let changed = false;
    if (!gap.current) {
      // Chat rows space via `.msg` margin-bottom; a generic list (e.g. the debug log)
      // spaces via the scroll container's flex `gap` — fall back to that so spacer
      // heights account for the inter-row gap either way.
      const first = rows.current.values().next().value as HTMLElement | undefined;
      const msg = first?.querySelector<HTMLElement>(".msg");
      const mb = msg ? parseFloat(getComputedStyle(msg).marginBottom) : 0;
      const cont = scrollRef.current;
      const rowGap = cont ? parseFloat(getComputedStyle(cont).rowGap) || 0 : 0;
      const g = mb || rowGap;
      if (g) {
        gap.current = g;
        changed = true;
      }
    }
    for (const [key, node] of rows.current) {
      const h = node.offsetHeight;
      if (h && heights.current.get(key) !== h) {
        heights.current.set(key, h);
        changed = true;
      }
    }
    if (changed) recompute();
  });

  // Recompute on scroll (rAF-coalesced), on container resize, and when the
  // message count changes (a new turn).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recompute);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    recompute();
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [scrollRef, recompute]);

  useLayoutEffect(() => {
    recompute();
  }, [count, recompute]);

  const start = Math.min(range.start, count);
  const end = Math.min(range.end, count);
  let padTop = 0;
  for (let i = 0; i < start; i++) padTop += rowHeight(i);
  let padBottom = 0;
  for (let i = end; i < count; i++) padBottom += rowHeight(i);

  const window: ReactNode[] = [];
  for (let i = start; i < end; i++) {
    const item = items[i];
    const key = getKey(item);
    window.push(
      <div
        key={key}
        ref={(n) => {
          if (n) rows.current.set(key, n);
          else rows.current.delete(key);
        }}
      >
        {children(item, i)}
      </div>,
    );
  }

  // Spacer heights are runtime-computed from measured rows → dynamic inline style
  // (the sanctioned exception to the Tailwind/no-inline-style rule). `flexShrink:0`
  // keeps an EMPTY spacer from being collapsed when the scroll container is a flex
  // column (e.g. the debug log's `.dbg-body-scroll`) — a flex item with no content
  // has `min-height:auto` = 0 and would otherwise shrink to nothing, breaking the
  // windowing. No effect in a block container (the chat thread), so it's safe there.
  return (
    <>
      <div aria-hidden style={{ height: padTop, flexShrink: 0 }} />
      {window}
      <div aria-hidden style={{ height: padBottom, flexShrink: 0 }} />
    </>
  );
}
