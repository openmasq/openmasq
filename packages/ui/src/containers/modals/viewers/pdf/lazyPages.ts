/**
 * On-demand page painting for the PDF preview. Every page of a long document is shown,
 * but a painted page is a full-resolution canvas (~13 MB at dpr 2), so only the pages
 * near the viewport hold one: a page entering the margin is painted, a page leaving it
 * is released and repainted on return. Pages paint ONE AT A TIME, nearest-first, so a
 * fast scroll never stacks dozens of concurrent pdf.js renders.
 */

export interface PageQueue {
  /** The page entered (true) or left (false) the paint margin. */
  want: (p: number, near: boolean) => void;
  stop: () => void;
}

/** The serial scheduler, DOM-free: `paint` mounts a page, `release` frees it. */
export function createPageQueue(o: {
  paint: (p: number) => Promise<boolean>;
  release: (p: number) => void;
}): PageQueue {
  const wanted = new Set<number>();
  const painted = new Set<number>();
  let running = false;
  let current = 0;
  let stopped = false;
  let last = 1;

  const pump = async () => {
    if (running) return;
    running = true;
    try {
      while (!stopped) {
        // Nearest to the last request first: the page the user is looking at.
        const next = [...wanted]
          .filter((p) => !painted.has(p))
          .sort((a, b) => Math.abs(a - last) - Math.abs(b - last))[0];
        if (next === undefined) break;
        painted.add(next);
        current = next;
        const ok = await o.paint(next).catch(() => false);
        current = 0;
        if (!ok) painted.delete(next);
        if (!ok || stopped) break;
        // Scrolled away while it painted: free it at once.
        if (!wanted.has(next)) {
          painted.delete(next);
          o.release(next);
        }
      }
    } finally {
      running = false;
    }
  };

  return {
    want(p, near) {
      if (stopped) return;
      if (near) {
        wanted.add(p);
        last = p;
        void pump();
      } else {
        wanted.delete(p);
        // The page painting right now is released by the pump when it lands.
        if (painted.has(p) && p !== current) {
          painted.delete(p);
          o.release(p);
        }
      }
    },
    stop() {
      stopped = true;
    },
  };
}

/** The element that scrolls `el` — the observer's root. With the implicit (viewport)
 *  root a page is first clipped by the scrolling panel, so the margin would never see
 *  the pages just below it. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(n).overflowY)) return n;
  }
  return null;
}

/** Wire the queue to the page shells through an IntersectionObserver. */
export function observePages(shells: HTMLElement[], queue: PageQueue): () => void {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) queue.want(Number((e.target as HTMLElement).dataset.page), e.isIntersecting);
    },
    { root: scrollParent(shells[0] ?? null), rootMargin: "1500px 0px" },
  );
  for (const s of shells) io.observe(s);
  return () => {
    io.disconnect();
    queue.stop();
  };
}
