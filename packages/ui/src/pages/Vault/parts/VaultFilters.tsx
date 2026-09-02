import type { CSSProperties } from "react";
import { SearchIcon } from "../../../components/brand";

import { useT } from "../../../i18n";
export interface VaultChip {
  id: string;
  label: string;
  /** The type's highlight hue key — absent on "Tous" (which wears the brand). */
  tone?: string;
}

/**
 * The Coffre's toolbar: category-filter chips (each wearing its type's hue square,
 * design-kit VaultPage) and search. « Ajouter un terme » is NOT here: it is the page
 * header's action, where the four pages put their « Créer ». Pure: the page owns
 * `filter` / `query` and the chip list.
 */
export function VaultFilters({
  chips,
  counts,
  filter,
  onFilter,
  query,
  onQuery,
}: {
  chips: VaultChip[];
  counts: Record<string, number>;
  filter: string;
  onFilter: (id: string) => void;
  query: string;
  onQuery: (q: string) => void;
}) {
  const t = useT();
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
          placeholder={t.lists.vault.search}
          className="om-vault-search-input"
        />
      </div>
    </div>
  );
}
