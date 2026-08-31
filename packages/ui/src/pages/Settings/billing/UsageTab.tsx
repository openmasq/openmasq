import { useMemo, useState } from "react";
import type { Conversation } from "../../../types";
import {
  usageByModel,
  countUnbilled,
  countEstimated,
  formatUsd,
  type BilledFilter,
} from "../../../state/usage";
import { formatTokens } from "../../../state/usage";
import { type CreditBalance, type OrgProfileInfo } from "../../../host";
import { useAppSelector } from "../../../state/redux";
import { selectBillingCache } from "../../../state/settingsCache";
import { tierLabel, formatCents } from "../../../state/billing";
import { useT } from "../../../i18n/I18nProvider";
import { CreditsMeter } from "./CreditsMeter";
import { dailyActivityCounts, dailyModelMessages } from "./usageActivity";
import { buildSeries, seriesColors } from "./usageSeries";
import { modelStyle } from "./usageHue";
import { UsageFilter } from "./UsageFilter";
import { UsageRange, DEFAULT_RANGE, type UsageRangeDays } from "./UsageRange";
import { ModelTimeline } from "./ModelTimeline";
import { subscriptionsSold } from "../../../send/platformAccess";

/**
 * Usage overview, matching the design-system `UsageSection`:
 *  1. 3 KPI cards (messages / tokens / credits — all REAL).
 *  2. Activity BARS over the SELECTED window (kit chrome; real daily counts).
 *  3. A per-model bar list (real `usageByModel`, cost is a USD estimate).
 *  4. The real prepaid `CreditsMeter` balances (org + personal) — not in the mockup
 *     but a real feature, kept below.
 */
export function UsageTab({
  conversations,
  orgProfile,
}: {
  conversations: Conversation[];
  orgProfile?: OrgProfileInfo | null;
}) {
  // Subscription + prepaid credits are prefetched into Redux on Settings arrival
  // (`settingsPrefetch`) — shared with the Paiement tab, so this tab reads them
  // from the cache instead of re-fetching on its own mount.
  const { sub, credits: personalCredits } = useAppSelector(selectBillingCache);
  const t = useT();

  // Hide an empty balance (0 consumed on a 0 allotment).
  const meaningful = (c?: CreditBalance | null): c is CreditBalance =>
    !!c && (c.allotmentCents > 0 || c.consumedCents > 0);
  const orgCredits = meaningful(orgProfile?.credits) ? orgProfile!.credits : undefined;
  const personal = meaningful(personalCredits) ? personalCredits : undefined;
  const hasCredits = !!orgCredits || !!personal;
  const creditBal = orgCredits ?? personal;

  // Billing-path filter — re-derives every message/token/model figure below. The
  // credit balances (server-metered, real) are unaffected.
  const [billed, setBilled] = useState<BilledFilter>("all");
  // La fenêtre est un FILTRE au même titre que la voie de facturation : les deux se
  // tiennent sur la même rangée, au-dessus des graphes, et chaque panneau la relit.
  const [days, setDays] = useState<UsageRangeDays>(DEFAULT_RANGE);

  const rows = useMemo(() => usageByModel(conversations, billed), [conversations, billed]);
  const unbilled = useMemo(() => countUnbilled(conversations), [conversations]);
  const estimated = useMemo(() => countEstimated(conversations, billed), [conversations, billed]);
  const totals = useMemo(
    () =>
      rows.reduce(
        (t, r) => ({ total: t.total + r.total, messages: t.messages + r.messages }),
        { total: 0, messages: 0 },
      ),
    [rows],
  );
  const maxTotal = useMemo(() => Math.max(1, ...rows.map((r) => r.total)), [rows]);
  const daily = useMemo(() => dailyActivityCounts(conversations, days), [conversations, days]);
  // La MÊME source de couleurs que la timeline : la pastille d'une ligne et son aplat
  // dans la barre doivent être la même chose, sinon les deux panneaux se contredisent.
  const colorOf = useMemo(() => {
    const { days: st, models } = dailyModelMessages(conversations, days, billed);
    return seriesColors(buildSeries(st, models));
  }, [conversations, days, billed]);
  const maxDaily = Math.max(...daily, 0);

  const kpi = (label: string, value: string, sub: string) => (
    <div className="usage-kpi">
      <div className="cv-eyebrow usage-kpi-label">{label}</div>
      <div className="usage-kpi-val">
        <span className="usage-kpi-num">{value}</span>
        <span className="usage-kpi-sub">{sub}</span>
      </div>
    </div>
  );

  const filterSub =
    billed === "byo" ? t.usageTab.subByo : billed === "subscription" ? t.usageTab.subSubscription : t.usageTab.subAll;

  return (
    <>
      <section className="settings-section">
        <div className="usage-filters">
          <UsageFilter value={billed} onChange={setBilled} />
          <UsageRange value={days} onChange={setDays} />
        </div>
      </section>

      <section className="settings-section">
        <div className="usage-kpis">
          {kpi(t.usageTab.kpiMessages, totals.messages.toLocaleString(t.common.intlTag), filterSub)}
          {kpi(t.usageTab.kpiTokens, formatTokens(totals.total), t.usageTab.kpiTokensSub)}
          {kpi(
            t.usageTab.kpiCredits,
            creditBal ? formatCents(Math.max(0, creditBal.consumedCents)) : "—",
            creditBal ? t.usageTab.kpiCreditsOf(formatCents(creditBal.allotmentCents)) : t.usageTab.kpiNoSubscription,
          )}
        </div>
        {billed !== "all" && unbilled > 0 && (
          <p className="mcp-note usage-unknown">
            {t.usageTab.unattributed(unbilled)}
          </p>
        )}
        {estimated > 0 && (
          <p className="mcp-note usage-unknown">
            {t.usageTab.estimated(estimated)}
          </p>
        )}
      </section>

      <section className="settings-section">
        <div className="usage-panel">
          <div className="usage-panel-head">
            <h3 className="usage-panel-title">{t.usageTab.activityTitle(days)}</h3>
            {/* The kit labels this "messages / jour, par modèle" over per-model stacked
                bars. The persisted schema has no per-message timestamp, so the only
                honest daily signal is conversations touched — say exactly that. */}
            {/* Le MAX est écrit : sans axe des ordonnées, une hauteur ne veut rien dire
                toute seule, et une infobulle « améliore, elle ne conditionne pas » — la
                valeur haute doit être lisible sans survoler. */}
            <span className="usage-panel-meta">
              {t.usageTab.activityMeta(maxDaily)}
            </span>
          </div>
          {/* Kit chrome: per-day BARS. The kit stacks them per model, but the schema
              has no per-message timestamp — a per-model split would be invented, so
              the bars stay single-hue over the honest daily signal. */}
          <div className="usage-bars" role="group" aria-label={t.usageTab.activityAria(days)}>
            {daily.map((v, i) => {
              const label = t.usageTab.dayLabel(days - 1 - i, v);
              return (
                /* La CIBLE de survol est la colonne entière, pas la barre : à 6 messages
                   sur 14 jours une barre fait 3 px de haut, et le jour à zéro n'a rien à
                   viser du tout. Focalisable pour que le clavier obtienne la même valeur
                   que la souris (`TooltipLayer` écoute aussi `focusin`). */
                <div
                  key={i}
                  className="usage-bar-col"
                  role="img"
                  tabIndex={0}
                  title={label}
                  aria-label={label}
                >
                  <div
                    className="usage-bar"
                    // height from data → the allowed inline-style exception
                    style={{ height: `${maxDaily > 0 ? Math.max(v > 0 ? 6 : 2, (v / maxDaily) * 100) : 2}%` }}
                  />
                </div>
              );
            })}
          </div>
          {/* Deux ancres suffisent à situer la fenêtre — un axe complet à 90 jours
              serait illisible, et à 7 il serait redondant. */}
          <div className="usage-axis">
            <span>J-{days - 1}</span>
            <span>J</span>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <ModelTimeline conversations={conversations} filter={billed} days={days} />
      </section>

      <section className="settings-section">
        <div className="usage-panel">
          <h3 className="usage-panel-title usage-mtitle">{t.usageTab.perModelTitle}</h3>
          {rows.length === 0 ? (
            <p className="mcp-empty usage-empty">{t.usageTab.perModelEmpty}</p>
          ) : (
            <div className="usage-models">
              {rows.map((r) => {
                const { vendor } = modelStyle(r.model);
                const pct = Math.round((r.total / maxTotal) * 100);
                return (
                  <div className="usage-mrow" key={r.model}>
                    {/* couleur issue de la donnée → l'exception inline assumée */}
                    <span className="usage-dot" style={{ background: colorOf.get(r.model) ?? "var(--chart-other)" }} />
                    <div className="usage-mname">
                      <div className="usage-mname-name">{r.label}</div>
                      <div className="usage-mname-vendor">{vendor}</div>
                    </div>
                    <div className="usage-mbar">
                      {/* largeur + couleur issues de la donnée → inline assumé */}
                      <div className="usage-mbar-fill" style={{ width: pct + "%", background: colorOf.get(r.model) ?? "var(--chart-other)" }} />
                    </div>
                    <span className="usage-mmsgs">{t.usageTab.msgs(r.messages.toLocaleString(t.common.intlTag))}</span>
                    <span
                      className="usage-mcost"
                      title={r.priced ? undefined : t.usageTab.unknownPrice}
                    >
                      {r.priced ? formatUsd(r.costUsd) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <p className="mcp-note">
          {t.usageTab.tokensNote}
        </p>
      </section>

      {hasCredits && (
        <section className="settings-section">
          <div className="cv-eyebrow">{t.usageTab.creditsEyebrow}</div>
          <p className="mcp-note">
            {t.usageTab.creditsNote}
          </p>
          <div className="usage-credits">
            {orgCredits && (
              <CreditsMeter label={t.usageTab.orgLabel} sub={orgProfile?.organizationName} credits={orgCredits} />
            )}
            {personal && (
              <CreditsMeter
                label={subscriptionsSold() ? t.usageTab.mySubscription : t.usageTab.myAccount}
                sub={sub?.freeMode ? t.billing.unlimitedTier : tierLabel(sub?.tier ?? "free", t)}
                credits={personal}
              />
            )}
          </div>
        </section>
      )}
    </>
  );
}
