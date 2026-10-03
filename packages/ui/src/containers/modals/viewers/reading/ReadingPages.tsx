import { CheckIcon } from "../../../../components/brand";
import { useT } from "../../../../i18n";
import type { ReadingPageView } from "./pageTiles";

/**
 * The pages of a PDF being read, each a BLURRED thumbnail with its state. The thumbnail is
 * already unreadable at the source (rendered ≤ 40 px wide in the extraction process); the
 * blur here only makes the upscale read as a page rather than as pixels.
 */
export function ReadingPages({ pages, more }: { pages: ReadingPageView[]; more: number }) {
  const t = useT();
  const r = t.viewers.reading;
  const label = (p: ReadingPageView) =>
    p.state === "read" ? r.pageRead(p.n) : p.state === "current" ? r.pageCurrent(p.n) : r.pageWaiting(p.n);
  return (
    <div className="fv-reading">
      <ol className="fv-reading-grid" aria-label={r.pagesLabel}>
        {pages.map((p) => (
          <li key={p.n} className={`fv-reading-page is-${p.state}`} title={label(p)} aria-label={label(p)}>
            <div className="fv-reading-sheet">
              {p.src && <img className="fv-reading-thumb" src={p.src} alt="" draggable={false} />}
            </div>
            <span className="fv-reading-badge" aria-hidden="true">
              {p.state === "read" ? (
                <CheckIcon size={11} />
              ) : p.state === "current" ? (
                <span className="fv-reading-spin" />
              ) : (
                <span className="fv-reading-dot" />
              )}
            </span>
            <span className="fv-reading-num" aria-hidden="true">
              {p.n}
            </span>
          </li>
        ))}
      </ol>
      {more > 0 && <div className="fv-reading-more">{r.morePages(more)}</div>}
    </div>
  );
}
