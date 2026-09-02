import { CheckIcon, TrashIcon } from "../../components/brand";
import { MEMORY_CATEGORIES, memoryCategory, memoryCategoryLabel } from "../../memory";
import type { ViewModeOf } from "../../hooks/useViewMode";
import type { MemoryCard, MemoryData } from "../../types";

import { useT } from "../../i18n";
/**
 * The Mémoire LIST view — the workhorse beside the graph: at 50+ cards, finding the one
 * fiche to edit is a scan, and a force layout doesn't scan. Rows sorted by recency
 * (optionally GROUPED by category), filtered by the toolbar's query + the legend's
 * category filter (`matched`); clicking selects the SAME node id the graph uses, so the
 * side panel (edit, history, connections) is one component for both views.
 *
 * A FRESH row (the « À revoir » inbox) carries its two treatment gestures inline —
 * Confirmer / Supprimer — so emptying the inbox doesn't require opening each card.
 */

/** The search + view toggle row above the stage — one row, shared state lives in the
 *  view (`MemoryView` owns `query`/`view`/`fresh`/`grouped`; the graph dims
 *  non-matches, the list filters). « À revoir » is the silent extraction's inbox:
 *  machine writes not yet TREATED (`memory/memory.ts` `freshCardIds`) plus the pending
 *  duplicate suggestions — it empties as you act, and an empty inbox shows no chip. */
export function MemoryToolbar({
  query,
  onQuery,
  view,
  onView,
  reviewCount,
  fresh,
  onFresh,
  grouped,
  onGrouped,
}: {
  query: string;
  onQuery: (q: string) => void;
  view: ViewModeOf<"memory">;
  onView: (v: ViewModeOf<"memory">) => void;
  reviewCount: number;
  fresh: boolean;
  onFresh: (on: boolean) => void;
  grouped?: boolean;
  onGrouped?: (on: boolean) => void;
}) {
  const t = useT();
  return (
    <div className="om-skill-filters om-mem-toolbar">
      <input
        className="om-mem-input om-mem-search"
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={t.lists.memory.search}
        aria-label={t.lists.memory.searchAria}
      />
      {reviewCount > 0 && (
        <button
          type="button"
          className={`om-skill-chip om-mem-fresh${fresh ? " on" : ""}`}
          aria-pressed={fresh}
          title={t.lists.memory.reviewTip}
          onClick={() => onFresh(!fresh)}
        >
          {t.lists.memory.review(reviewCount)}
        </button>
      )}
      <span className="om-skill-spacer" />
      {view === "list" && onGrouped && (
        <button
          type="button"
          className={`om-skill-chip${grouped ? " on" : ""}`}
          aria-pressed={grouped}
          onClick={() => onGrouped(!grouped)}
        >
          {t.lists.memory.byCategory}
        </button>
      )}
      {/* Graph FIRST: it is the default (the page opens on the map of what the app
          knows), the list is the workhorse one switches to — the order of the two chips
          is the order one meets them. */}
      {(["graph", "list"] as const).map((v) => (
        <button
          key={v}
          type="button"
          className={`om-skill-chip${view === v ? " on" : ""}`}
          aria-pressed={view === v}
          onClick={() => onView(v)}
        >
          {t.lists.memory.views[v]}
        </button>
      ))}
    </div>
  );
}

function Row({
  c,
  fresh,
  selected,
  onSelect,
  onConfirm,
  onRemove,
}: {
  c: MemoryCard;
  fresh: boolean;
  selected: boolean;
  onSelect: (nodeId: string) => void;
  onConfirm?: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  const t = useT();
  return (
    <div role="listitem" className={`om-mem-row${selected ? " on" : ""}${fresh ? " fresh" : ""}`}>
      <button type="button" className="om-mem-row-main" onClick={() => onSelect(`card-${c.id}`)}>
        <span className="om-mem-dot-chip sm" style={{ background: `var(--hl-${memoryCategory(c.cat).tone})` }} />
        <span className="om-mem-row-entity">{c.entity}</span>
        <span className="om-mem-row-facts">{c.facts}</span>
        {c.source === "auto" && <span className="om-mem-row-badge">{t.lists.memory.autoBadge}</span>}
        <span className="om-mem-row-date">{new Date(c.updatedAt).toLocaleDateString(t.common.intlTag)}</span>
      </button>
      {fresh && onConfirm && (
        <button
          type="button"
          className="om-mem-row-act"
          title={t.lists.memory.confirmTip}
          onClick={() => onConfirm(c.id)}
        >
          <CheckIcon size={13} /> {t.lists.memory.confirm}
        </button>
      )}
      {/* The trash icon on ALL rows, not just « À revoir »: deleting used to
          require opening the panel and hunting for its footer. Undoable (toast). */}
      {onRemove && (
        <button
          type="button"
          className="om-mem-row-act danger"
          title={t.lists.memory.removeTip}
          aria-label={t.lists.memory.removeAria(c.entity)}
          onClick={() => onRemove(c.id)}
        >
          <TrashIcon size={13} />
        </button>
      )}
    </div>
  );
}

export function MemoryList({
  memoryData,
  matched,
  freshIds,
  grouped,
  selectedCardId,
  onSelect,
  onConfirm,
  onRemove,
}: {
  memoryData: MemoryData;
  /** From `matchingCardIds` (query ∩ legend category ∩ inbox) — `null` shows everything. */
  matched: Set<string> | null;
  /** The « À revoir » inbox — those rows get inline Confirmer / Supprimer. */
  freshIds?: Set<string>;
  /** Group the rows under category headers (recency inside each group). */
  grouped?: boolean;
  selectedCardId: string | null;
  /** Selects the card's GRAPH node id (`card-<id>`), shared with the graph view. */
  onSelect: (nodeId: string) => void;
  onConfirm?: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  const t = useT();
  const rows = memoryData.cards
    .filter((c) => !matched || matched.has(c.id))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  if (!rows.length) {
    return <p className="om-skill-desc om-mem-list-empty">{t.lists.memory.noMatch}</p>;
  }
  const row = (c: MemoryCard) => (
    <Row
      key={c.id}
      c={c}
      fresh={freshIds?.has(c.id) ?? false}
      selected={selectedCardId === c.id}
      onSelect={onSelect}
      onConfirm={onConfirm}
      onRemove={onRemove}
    />
  );
  if (!grouped) {
    return (
      <div className="om-mem-list" role="list">
        {rows.map(row)}
      </div>
    );
  }
  const groups = MEMORY_CATEGORIES.map((cat) => ({
    cat,
    rows: rows.filter((c) => c.cat === cat.id),
  })).filter((g) => g.rows.length > 0);
  return (
    <div className="om-mem-list" role="list">
      {groups.map((g) => (
        <div key={g.cat.id} className="om-mem-group">
          <div className="cv-eyebrow om-mem-group-head">
            {memoryCategoryLabel(g.cat.id, t)} · {g.rows.length}
          </div>
          {g.rows.map(row)}
        </div>
      ))}
    </div>
  );
}
