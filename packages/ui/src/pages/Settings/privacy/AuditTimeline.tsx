import { useMemo } from "react";
import { useT } from "../../../i18n";
import { PRIVACY_KINDS } from "../../../privacy/redactCategories";
import { dailyRedactionsByCategory, type RedactionAt } from "./auditActivity";
import { privacyKindLabel } from "../../../help/catalogCopy";

const KIND_META = new Map(PRIVACY_KINDS.map((k) => [k.key, k]));

/**
 * Cumulative stacked bars — valeurs redacted / jour, split per category. The SAME
 * chart as the Usage tab's `ModelTimeline` (reuses its `.usage-*` design), but counting
 * protected values by kind instead of messages by model. Fed the audit's own rows, so
 * every figure re-derives from what the list shows. Categories wear their `CATEGORY_HUE`
 * colour (single-sourced via `PRIVACY_KINDS`).
 */
export function AuditTimeline({ entries, days = 14 }: { entries: RedactionAt[]; days?: number }) {
  const t = useT();
  const { days: stack, cats } = useMemo(
    () => dailyRedactionsByCategory(entries, days),
    [entries, days],
  );
  const maxDay = Math.max(1, ...stack.map((d) => d.total));
  const hasData = cats.length > 0;
  const label = (k: string) => privacyKindLabel(k, t);
  const colour = (k: string) => KIND_META.get(k)?.fg ?? "var(--text-faint)";

  return (
    <div className="usage-panel">
      <div className="usage-panel-head">
        <h3 className="usage-panel-title">{t.privacyTab.timelineTitle(days)}</h3>
        <span className="usage-panel-meta">{t.privacyTab.timelineMeta}</span>
      </div>

      {!hasData ? (
        <p className="mcp-empty usage-empty">{t.privacyTab.timelineEmpty}</p>
      ) : (
        <>
          <div className="usage-stack" role="img" aria-label={t.privacyTab.timelineAria}>
            {stack.map((d, i) => (
              <div key={i} className="usage-stack-col">
                {/* total height from data → the allowed inline-style exception */}
                <div
                  className="usage-stack-bar"
                  title={t.privacyTab.timelineBarTip(d.total)}
                  style={{ height: `${(d.total / maxDay) * 100}%` }}
                >
                  {cats.map((k) => {
                    const c = d.byCat[k] ?? 0;
                    if (c === 0) return null;
                    return (
                      <div
                        key={k}
                        className="usage-stack-seg"
                        // per-segment share + per-category hue → runtime inline
                        style={{ height: `${(c / d.total) * 100}%`, background: colour(k) }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="usage-axis">
            <span>J-{days - 1}</span>
            <span>J</span>
          </div>
          <div className="usage-legend">
            {cats.map((k) => (
              <span key={k} className="usage-legend-item">
                <span className="usage-legend-dot" style={{ background: colour(k) }} />
                {label(k)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
