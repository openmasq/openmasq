import { sameUrl, type BrowserBookmark } from "./browserTarget";

/**
 * The browser's BOOKMARKS row (kit `om-vb-marks`): one pill per starred page,
 * under the viewport. Pure — the panel owns the list (it rides
 * `Settings.browserBookmarks`) and the navigation. Hidden entirely when empty:
 * an empty chrome row is furniture.
 */
export function BookmarksBar({
  bookmarks,
  currentUrl,
  onOpen,
}: {
  bookmarks: BrowserBookmark[];
  currentUrl: string;
  onOpen: (url: string) => void;
}) {
  if (bookmarks.length === 0) return null;
  return (
    <div className="vb-marks" role="toolbar" aria-label="Favoris">
      {bookmarks.map((b) => (
        <button
          key={b.url}
          type="button"
          className={`vb-mark${sameUrl(b.url, currentUrl) ? " on" : ""}`}
          title={b.url}
          onClick={() => onOpen(b.url)}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}
