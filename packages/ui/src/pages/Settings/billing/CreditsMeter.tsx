import { formatCents } from "../../../state/billing";
import type { CreditBalance } from "../../../host";
import { useLocale, useT } from "../../../i18n/I18nProvider";

/**
 * The "your included usage ran out" note. Both credit surfaces (this meter and the
 * billing block) render THIS — they used to carry a hand-written copy each, and the two
 * had already drifted on what still works once the budget is spent.
 */
export function CreditsExhausted() {
  const t = useT();
  return (
    <div className="mt-2 text-xs text-body">
      <b className="text-strong">{t.billing.exhaustedTitle}</b> {t.billing.exhaustedBody}
    </div>
  );
}

/**
 * A prepaid-credit usage meter (consumed / remaining / allotment + a bar), shared
 * by the Usage tab's org + personal blocks. Unlike the per-model token table (a
 * cost ESTIMATE), these figures are the real server-metered balance. The bar width
 * is a runtime value → the one allowed inline `style`.
 */
export function CreditsMeter({
  label,
  sub,
  credits,
}: {
  label: string;
  sub?: string;
  credits: CreditBalance;
}) {
  const t = useT();
  const { locale } = useLocale();
  const pct =
    credits.allotmentCents > 0
      ? Math.min(100, Math.round((credits.consumedCents / credits.allotmentCents) * 100))
      : 0;
  // Mode gratuit : aucun plafond, donc ni « restants sur », ni jauge — la consommation seule.
  if (credits.unlimited) {
    return (
      <div className="settings-card pad">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-strong text-sm">{label}</span>
          {sub && <span className="text-xs text-muted">{sub}</span>}
        </div>
        <div className="text-sm text-body">
          {t.billing.freeModeUsed(formatCents(Math.max(0, credits.consumedCents), locale))}
        </div>
      </div>
    );
  }
  return (
    <div className="settings-card pad">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-strong text-sm">{label}</span>
        {sub && <span className="text-xs text-muted">{sub}</span>}
      </div>
      <div className="flex items-baseline justify-between mb-2 text-sm text-body">
        <span>
          <b className="text-strong">{formatCents(Math.max(0, credits.consumedCents))}</b>
          {t.billingTab.usedRemaining(
            formatCents(Math.max(0, credits.consumedCents)),
            formatCents(Math.max(0, credits.balanceCents)),
            formatCents(credits.allotmentCents),
          )}
        </span>
        <span className="text-xs text-muted">{pct}%</span>
      </div>
      <div className="h-2 bg-surface-sunken rounded-[var(--radius-pill)] overflow-hidden">
        <div
          className={`h-full rounded-[var(--radius-pill)] ${
            credits.blocked ? "bg-[var(--red-500,#d4493f)]" : "bg-[var(--forest-500,#3c6b1e)]"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {credits.blocked && <CreditsExhausted />}
    </div>
  );
}
