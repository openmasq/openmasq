import type { CSSProperties } from "react";
import { PlusIcon, SearchIcon } from "../../../components/brand";

export interface VaultChip {
  id: string;
  label: string;
  /** The type's highlight hue key — absent on "Tous" (which wears the brand). */
  tone?: string;
}

/**
 * The Coffre's toolbar: type-filter chips (each wearing its type's hue square,
 * design-kit VaultPage), search, and the "Ajouter un terme" button that opens
 * the add modal. Pure: the page owns `filter` / `query` and the chip list.
 */
export function VaultFilters({
  chips,
  counts,
  filter,
  onFilter,
  query,
  onQuery,
  onAdd,
  showAdd = true,
}: {
  chips: VaultChip[];
  counts: Record<string, number>;
  filter: string;
  onFilter: (id: string) => void;
  query: string;
  onQuery: (q: string) => void;
  onAdd: () => void;
  /** Hide the "Ajouter un terme" button when an empty state is shown — its own CTA
   *  already offers the add, so the toolbar button would be a duplicate. */
  showAdd?: boolean;
}) {
  return (
    <div className="om-vault-filters">
      {chips.map((c) => (
        <button
          key={c.id}
          className={`om-vault-chip${filter === c.id ? " on" : ""}${c.tone ? " toned" : ""}`}
          onClick={() => onFilter(c.id)}
          style={c.tone ? ({ "--chip-tone": `var(--hl-${c.tone})` } as CSSProperties) : undefined}
        >
          {c.tone && <span className="om-vault-chip-dot" aria-hidden="true" />}
          <span className="om-sweep">{c.label}</span>
          <span className="om-vault-chip-count">{counts[c.id] || 0}</span>
        </button>
      ))}
      <div className="om-vault-spacer" />
      <div className="om-vault-search">
        <SearchIcon size={15} />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Rechercher un terme"
          className="om-vault-search-input"
        />
      </div>
      {showAdd && (
        <button className="btn-primary om-vault-add-btn" onClick={onAdd}>
          <PlusIcon size={16} /> Ajouter un terme
        </button>
      )}
    </div>
  );
}
