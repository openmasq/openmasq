import { BRAND } from "@openmasq/branding";
import { ShieldIcon } from "../../../components/brand";
import type { CreditBalance } from "../../../host";
import { useLocale, useT } from "../../../i18n/I18nProvider";
import { formatCents } from "../../../state/billing";

/**
 * L'onglet Paiement en MODE GRATUIT (`BillingSubscription.freeMode`) : ce déploiement ne
 * vend rien et ne plafonne rien, donc ni grille d'offres, ni portail Stripe, ni jauge
 * « restants sur ». Une seule carte qui dit ce qui est vrai, et la consommation du mois
 * pour qui veut la voir — une mesure, pas un solde.
 *
 * La copie vient du catalogue (`t.billing.*`) : cet écran est neuf, et le cliquet i18n
 * refuse à un fichier neuf toute copie française en dur — c'est exactement son rôle.
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
