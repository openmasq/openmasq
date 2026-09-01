import { DownloadIcon, SearchIcon } from "../../../components/brand";
import { ViewModeToggle } from "../../../components/ViewModeToggle";
import type { ViewMode } from "../../../hooks/useViewMode";

import { useT } from "../../../i18n";
/**
 * The bar above the list: categories, import, view, search.
 *
 * Extracted from `CompetencesView` once it went past 300 lines (rule 1). Pure —
 * each gesture is a prop, the page keeps the writes.
 */
export function SkillFilters({
  chips,
  counts,
  cat,
  onCat,
  query,
  onQuery,
  view,
  onView,
  onImport,
}: {
  chips: { id: string; label: string }[];
  counts: Record<string, number>;
  cat: string;
  onCat: (id: string) => void;
  query: string;
  onQuery: (q: string) => void;
  view: ViewMode;
  onView: (m: ViewMode) => void;
  /** Absent (web preview, no disk slot) ⇒ no button: it would promise a
   *  read the platform can't perform. */
  onImport?: () => void;
}) {
  const t = useT();
  return (
    <div className="om-skill-filters">
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`om-skill-chip${cat === c.id ? " on" : ""}`}
          onClick={() => onCat(c.id)}
          aria-pressed={cat === c.id}
        >
          <span className="om-sweep">{c.label}</span>
          <span className="om-skill-chip-n">{counts[c.id] ?? 0}</span>
        </button>
      ))}
      <span className="om-skill-spacer" />
      {onImport && (
        // Two clicks: open, confirm.
        <button
          type="button"
          className="om-skill-import"
          onClick={onImport}
          title={t.lists.skills.importTip}
          aria-label={t.lists.skills.import}
        >
          <DownloadIcon size={15} />
        </button>
      )}
      <ViewModeToggle mode={view} onChange={onView} />
      <div className="om-skill-search">
        <SearchIcon size={15} />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t.lists.skills.search}
          aria-label={t.lists.skills.search}
        />
      </div>
    </div>
  );
}
