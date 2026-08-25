import { DownloadIcon, SearchIcon } from "../../../components/brand";
import { ViewModeToggle } from "../../../components/ViewModeToggle";
import type { ViewMode } from "../../../hooks/useViewMode";

/**
 * La barre au-dessus de la liste : catégories, import, affichage, recherche.
 *
 * Sortie de `CompetencesView` quand celle-ci a passé les 300 lignes (règle 1). Pure —
 * chaque geste est une prop, la page garde les écritures.
 */
export function CompetenceFilters({
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
  /** Absent (aperçu web, pas de créneau disque) ⇒ pas de bouton : il promettrait une
   *  lecture que la plateforme ne sait pas faire. */
  onImport?: () => void;
}) {
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
        // Deux clics : ouvrir, valider.
        <button
          type="button"
          className="om-skill-import"
          onClick={onImport}
          title="Importer depuis Claude — vos compétences Claude Code, ou un dossier déposé"
          aria-label="Importer depuis Claude"
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
          placeholder="Rechercher une compétence"
          aria-label="Rechercher une compétence"
        />
      </div>
    </div>
  );
}
