import { useT } from "../../../i18n";
/** The offered windows. 14 stays the default — it's what the panels used to show
 *  before they became adjustable, and changing the default would have changed every
 *  figure without anyone asking for it. 90 is the ceiling: beyond that, a bar per day
 *  becomes a one-pixel line and the graph stops being readable. */
const RANGES = [7, 14, 30, 90] as const;
export type UsageRangeDays = (typeof RANGES)[number];
export const DEFAULT_RANGE: UsageRangeDays = 14;

/**
 * The usage panels' observation window — 7 / 14 / 30 / 90 days.
 *
 * Presentation only: the parent holds the value and re-derives every figure. Same
 * segmented control as `UsageFilter`, and placed on THE SAME ROW as it: a dashboard's
 * filters belong in one row above the graphs, not scattered across panel
 * headers — otherwise you go hunting for which one acts on what.
 */
export function UsageRange({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: UsageRangeDays) => void;
}) {
  const t = useT();
  return (
    <div className="om-seg" role="tablist" aria-label={t.usageTab.rangeAria}>
      {RANGES.map((d) => (
        <button
          key={d}
          type="button"
          role="tab"
          aria-selected={value === d}
          className={`om-seg-btn${value === d ? " on" : ""}`}
          onClick={() => onChange(d)}
        >
          {t.usageTab.days(d)}
        </button>
      ))}
    </div>
  );
}
