import { SearchIcon, XIcon } from "../../../../components/brand";
import { SEARCH_MIN_LEN } from "./docSearch";
import type { useDocSearch } from "./useDocSearch";

import { useT } from "../../../../i18n";
/** The find-in-document bar for the attachment preview text tabs: input, an "n/m"
 *  match counter, prev/next (Enter = next, Shift+Enter = prev) and a clear button.
 *  Driven entirely by a {@link useDocSearch} instance. */
export function DocSearchBar({ search }: { search: ReturnType<typeof useDocSearch> }) {
  const t = useT();
  return (
    <div className="fv-search">
      <SearchIcon size={15} />
      <input
        className="fv-search-input"
        value={search.query}
        onChange={(e) => search.setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.shiftKey ? search.prev : search.next)();
          }
        }}
        placeholder={t.viewers.search.placeholder}
      />
      {search.query.trim().length >= SEARCH_MIN_LEN && (
        <span className="fv-search-count">
          {search.total ? `${search.active + 1}/${search.total}` : "0"}
        </span>
      )}
      <button className="fv-search-nav" onClick={search.prev} disabled={!search.total} aria-label={t.viewers.search.previous}>
        ↑
      </button>
      <button className="fv-search-nav" onClick={search.next} disabled={!search.total} aria-label={t.viewers.search.next}>
        ↓
      </button>
      {!!search.query && (
        <button className="fv-search-clear" onClick={() => search.setQuery("")} aria-label={t.viewers.search.clear}>
          <XIcon size={14} />
        </button>
      )}
    </div>
  );
}
