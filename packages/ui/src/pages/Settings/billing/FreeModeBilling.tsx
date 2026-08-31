import { BRAND } from "@openmasq/branding";
import { ShieldIcon } from "../../../components/brand";
import type { CreditBalance } from "../../../host";
import { useLocale, useT } from "../../../i18n/I18nProvider";
import { formatCents } from "../../../state/billing";

/**
 * The Payment tab in FREE MODE (`BillingSubscription.freeMode`): this deployment sells
 * nothing and caps nothing, so no plan grid, no Stripe portal, no « remaining out of »
 * gauge. A single card stating what's true, and the month's usage
 * for whoever wants to see it — a measurement, not a balance.
 *
 * The copy comes from the catalogue (`t.billing.*`): this screen is new, and the i18n ratchet
 * refuses a new file any hardcoded French copy — that is exactly its purpose.
 */
export function FreeModeBilling({ credits }: { credits: CreditBalance | null }) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <div className="flex flex-col gap-5">
      <section>
        <div className="cv-eyebrow mb-3">{t.billing.freeModeEyebrow}</div>
        <div className="settings-card">
          <div className="flex items-start gap-3.5 px-[18px] py-4">
            <span className="mt-0.5 shrink-0 text-brand">
              <ShieldIcon size={18} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-base font-semibold text-strong">{t.billing.freeModeTitle}</div>
              <div className="mt-1 text-sm text-body">{t.billing.freeModeBody(BRAND.name)}</div>
              {credits && (
                <div className="mt-3 text-xs text-muted">
                  {t.billing.freeModeUsed(formatCents(Math.max(0, credits.consumedCents), locale))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
