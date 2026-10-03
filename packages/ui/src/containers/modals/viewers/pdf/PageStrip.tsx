import { useEffect, useRef } from "react";
import { CheckIcon } from "../../../../components/brand";
import { useT } from "../../../../i18n";
import type { PdfPageState } from "./pendingPages";

export interface StripPage {
  n: number;
  state: PdfPageState;
  /** The unreadable thumbnail streamed while the file is read (≤ 40 px at the source). */
  thumb?: string;
}

/**
 * The page strip at the top of the PDF viewer: one small tile per page, its state while the
 * document is read and masked (masked ✓, read, being read, waiting), the page in view
 * marked. A click — or ←/→, ↑/↓ (`usePageNav`) — jumps to a page. The same strip while the
 * masking runs and once it is over.
 */
export function PageStrip({
  pages,
  current,
  final,
  onPick,
}: {
  pages: StripPage[];
  current: number;
  /** The masking is over: every tile is just a page to go to. */
  final: boolean;
  onPick: (n: number) => void;
}) {
  const t = useT();
  const r = t.viewers.reading;
  const listRef = useRef<HTMLOListElement>(null);
  // Keep the tile of the page in view visible — scrolling the STRIP only, never the panel.
  useEffect(() => {
    const list = listRef.current;
    const tile = list?.children[current - 1] as HTMLElement | undefined;
    if (!list || !tile) return;
    const left = tile.offsetLeft - list.offsetLeft;
    if (left < list.scrollLeft || left + tile.offsetWidth > list.scrollLeft + list.clientWidth) {
      list.scrollLeft = left - list.clientWidth / 2 + tile.offsetWidth / 2;
    }
  }, [current]);
  const label = (p: StripPage) =>
    final
      ? t.viewers.pdf.goToPage(p.n)
      : p.state === "masked"
        ? r.pageMasked(p.n)
        : p.state === "read"
          ? r.pageRead(p.n)
          : p.state === "current"
            ? r.pageCurrent(p.n)
            : r.pageWaiting(p.n);
  return (
    <nav className="pdfv-strip" aria-label={r.pagesLabel}>
      <ol ref={listRef} className="pdfv-strip-list">
        {pages.map((p) => (
          <li key={p.n}>
            <button
              type="button"
              className={`pdfv-strip-page is-${p.state}${p.n === current ? " is-here" : ""}`}
              aria-current={p.n === current ? "page" : undefined}
              title={label(p)}
              aria-label={label(p)}
              onClick={() => onPick(p.n)}
            >
              <span className="pdfv-strip-sheet">
                {p.thumb && <img className="pdfv-strip-thumb" src={p.thumb} alt="" draggable={false} />}
                {!final && p.state === "masked" && (
                  <span className="pdfv-strip-badge" aria-hidden="true">
                    <CheckIcon size={9} />
                  </span>
                )}
                {p.state === "current" && <span className="pdfv-strip-spin" aria-hidden="true" />}
              </span>
              <span className="pdfv-strip-num" aria-hidden="true">
                {p.n}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
