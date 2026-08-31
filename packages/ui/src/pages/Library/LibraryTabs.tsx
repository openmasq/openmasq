import { SearchIcon } from "../../components/brand";
import { libTabs, type LibTab } from "./libraryKinds";

import { useT } from "../../i18n";
/**
 * The library's category tab bar (Tout / Images / Documents / Tableurs / Audio) with
 * live counts, plus the search field on the right — the design's LibraryPage header.
 * Pure presentation; the active filter + query live in LibraryView.
 *
 * Every tab filters the SAME stored files. The granted LOCAL folders are a different
 * gisement and are no longer browsed here: they live in the right rail's « Dossiers »
 * view, beside the conversation where one actually reaches for a file.
 */
export function LibraryTabs({
  active,
  onSelect,
  counts,
  query,
  onQuery,
}: {
  active: LibTab;
  onSelect: (id: LibTab) => void;
  counts: Record<string, number>;
  query: string;
  onQuery: (q: string) => void;
}) {
  const t = useT();
  return (
    <div className="lib-tabs">
      {libTabs(t).map((tab) => {
        const on = active === tab.id;
        return (
          <button
            key={tab.id}
            className={`lib-tab${on ? " on" : ""}`}
            onClick={() => onSelect(tab.id)}
            aria-pressed={on}
          >
            {tab.label}
            <span className="lib-tab-count">{counts[tab.id] ?? 0}</span>
          </button>
        );
      })}
      <div className="lib-tabs-spacer" />
      <label className="lib-search">
        <SearchIcon size={15} />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t.lists.library.search}
        />
      </label>
    </div>
  );
}
