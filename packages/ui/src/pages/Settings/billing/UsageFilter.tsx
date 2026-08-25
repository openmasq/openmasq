import type { BilledFilter } from "../../../state/usage";

const OPTIONS: { id: BilledFilter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "byo", label: "Avec mes clés" },
  { id: "subscription", label: "Avec l'abonnement" },
];

/**
 * The billing-path selector for the Usage view: Tous / Avec mes clés / Avec
 * l'abonnement. Presentation only — the parent owns the value and re-derives every
 * figure from it. A segmented `role="tablist"` (mirrors `MobileSectionSegments`).
 */
export function UsageFilter({
  value,
  onChange,
}: {
  value: BilledFilter;
  onChange: (v: BilledFilter) => void;
}) {
  return (
    <div className="om-seg" role="tablist" aria-label="Filtrer la consommation">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          className={`om-seg-btn${value === o.id ? " on" : ""}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
