import { useMemo } from "react";
import type { Conversation } from "../../../types";
import type { BilledFilter } from "../../../state/usage";
import { findModelAny } from "../../../prompt/models";
import { dailyModelMessages } from "./usageActivity";
import { OTHER_ID, buildSeries, dayCount } from "./usageSeries";

import { useT } from "../../../i18n";
/** The displayed name of a series: the registry's label, or "Autres" for the bucket. */
const seriesLabel = (id: string, other: string): string =>
  id === OTHER_ID ? other : findModelAny(id)?.label ?? id;

/**
 * Stacked bars — messages/day, one color PER MODEL.
 *
 * ⚠️ Colors come from the categorical `--chart-*` ramp, never from the `--hl-*` ones.
 * Redaction tints are highlighter backgrounds: measured at 1.3–2.5:1 on a
 * white card, they fail as series. And they colored by PROVIDER — two
 * OpenAI models therefore wore the same flat tone, which left the question "which one did I
 * use most?" unanswered. `usageSeries.ts` names the first five and folds the
 * rest into "Autres".
 *
 * ⚠️ The 2px hairline between segments is not an ornament. The weakest CVD
 * separation of the light ramp falls to 7.2 (tritan), which the dataviz reference only
 * allows with a SECONDARY encoding — the gap and the legend are that encoding. Removing it
 * makes two neighboring series indistinguishable for some readers.
 */
export function ModelTimeline({
  conversations,
  filter,
  days = 14,
}: {
  conversations: Conversation[];
  filter: BilledFilter;
  days?: number;
}) {
  const t = useT();
  const { days: stack, models } = useMemo(
    () => dailyModelMessages(conversations, days, filter),
    [conversations, days, filter],
  );
  const series = useMemo(() => buildSeries(stack, models), [stack, models]);
  const named = useMemo(
    () => new Set(series.filter((s) => s.id !== OTHER_ID).map((s) => s.id)),
    [series],
  );
  const maxDay = Math.max(1, ...stack.map((d) => d.total));

  return (
    <div className="usage-panel">
      <div className="usage-panel-head">
        <h3 className="usage-panel-title">{t.usageTab.timelineTitle(days)}</h3>
        {/* The MAX is written out: without a y-axis, a height alone says nothing, and
            the tooltip must ADD a reading, not condition one. */}
        <span className="usage-panel-meta">
          {t.usageTab.timelineMeta(maxDay)}
        </span>
      </div>

      {series.length === 0 ? (
        <p className="mcp-empty usage-empty">{t.usageTab.timelineEmpty}</p>
      ) : (
        <>
          <div className="usage-stack" role="group" aria-label={t.usageTab.timelineAria}>
            {stack.map((d, i) => {
              // The hover says WHO, not just how many: a stacked bar with no
              // tooltip forces a back-and-forth to the legend for every
              // segment. Oldest day on the left; an empty day says so too.
              const day = `J-${days - 1 - i}`;
              const lines = series
                .map((s) => ({ s, n: dayCount(d, s, named) }))
                .filter((x) => x.n > 0)
                .map((x) => `${seriesLabel(x.s.id, t.usageTab.other)} : ${x.n}`);
              const label = lines.length ? [day, ...lines].join("\n") : `${day} · aucun message`;
              return (
                /* The target is the COLUMN, not the bar: at one message a day the bar
                   is a few pixels, and an empty day has nothing to aim at. Focusable —
                   the keyboard reads the same thing as the mouse (`TooltipLayer`/`focusin`). */
                <div
                  key={i}
                  className="usage-stack-col"
                  role="img"
                  tabIndex={0}
                  title={label}
                  aria-label={label.replace(/\n/g, ", ")}
                >
                  <div
                    className="usage-stack-bar"
                    // height derived from the data → the inline exception is accepted
                    style={{ height: `${(d.total / maxDay) * 100}%` }}
                  >
                    {series.map((s) => {
                      const n = dayCount(d, s, named);
                      if (n === 0) return null;
                      return (
                        <div
                          key={s.id}
                          className="usage-stack-seg"
                          style={{ height: `${(n / d.total) * 100}%`, background: s.color }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="usage-axis">
            <span>J-{days - 1}</span>
            <span>J</span>
          </div>
          <div className="usage-legend">
            {series.map((s) => (
              <span key={s.id} className="usage-legend-item">
                <span className="usage-legend-dot" style={{ background: s.color }} />
                {seriesLabel(s.id, t.usageTab.other)}
                <span className="usage-legend-n">{s.total}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
