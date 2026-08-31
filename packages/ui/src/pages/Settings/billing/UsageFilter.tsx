import type { Messages } from "@openmasq/i18n";
import type { BilledFilter } from "../../../state/usage";

import { useT } from "../../../i18n";
const OPTIONS: { id: BilledFilter; label: (t: Messages) => string }[] = [
  { id: "all", label: (t) => t.usageTab.filterAll },
  { id: "byo", label: (t) => t.usageTab.filterByo },
  { id: "subscription", label: (t) => t.usageTab.filterSubscription },
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
  const t = useT();
  return (
    <div className="om-seg" role="tablist" aria-label={t.usageTab.filterAria}>
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          className={`om-seg-btn${value === o.id ? " on" : ""}`}
          onClick={() => onChange(o.id)}
        >
          {o.label(t)}
        </button>
      ))}
    </div>
  );
}
