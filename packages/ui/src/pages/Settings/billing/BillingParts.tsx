import { CheckIcon, ShieldIcon } from "../../../components/brand";
import { ConfirmDialog } from "../../../components/feedback/ConfirmDialog";
import type { CreditBalance, Host, OrgProfileInfo } from "../../../host";
import { formatCents, planTiers, type PlanTier } from "../../../state/billing";
import { CreditsExhausted } from "./CreditsMeter";
import { BRAND } from "@openmasq/branding";

import { useT } from "../../../i18n";
// Presentational pieces split out of BillingTab to keep it under the 300-LOC cap.

// Tier order, so we can tell an upgrade from a downgrade (label + confirmation).
export const TIER_RANK: Record<string, number> = { free: 0, solo: 1, team: 2, scale: 3 };

/** One plan card in the "VOTRE ABONNEMENT" grid. The parent owns the real billing
 *  actions (checkout / change-tier / portal); this only renders + routes the click.
 *  The FREE card's downgrade goes to the portal (there is no free Stripe price). */
export function PlanCard({
  p,
  on,
  isPaid,
  currentTier,
  tierKnown = true,
  busy,
  billingAvailable,
  instant = false,
  onPick,
  onPortal,
}: {
  p: PlanTier;
  on: boolean;
  isPaid: boolean;
  currentTier: string;
  /** False when the subscription could not be read (signed out / backend unreachable).
   *  The FREE card's « Revenir au gratuit » only makes sense RELATIVE to a known paid
   *  plan — unknown ⇒ that button is hidden (the grid's notice explains); the paid
   *  cards keep their generic « S'abonner » (valid whatever the truth; a click
   *  surfaces the real error, e.g. « Connectez-vous… »). */
  tierKnown?: boolean;
  busy: string | null;
  billingAvailable: boolean;
  /** Mode testeur du déploiement : le MÊME bouton, mais l'action est INSTANTANÉE — le
   *  palier est posé côté serveur au lieu d'ouvrir Stripe. Le libellé ne change donc pas
   *  (c'est le même geste pour la personne), seulement ce qu'il déclenche ; et il ne
   *  dépend plus de Stripe, puisqu'un octroi n'appelle personne. */
  instant?: boolean;
  onPick: (tier: string) => void;
  onPortal: () => void;
}) {
  const t = useT();
  return (
    <div
      className={`flex flex-col gap-3 p-[18px] rounded-[var(--radius-lg)] bg-surface-card border-[1.5px] transition-colors ${
        on ? "border-[var(--text-strong)]" : "border-border-default"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-base font-bold text-strong">{p.name}</span>
        {p.recommended && (
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-strong bg-[var(--hl-lime)] rounded-[3px] px-1.5 py-0.5">
            {t.billingTab.recommended}
          </span>
        )}
        {p.tag && (
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted border border-border-default rounded-[3px] px-1.5 py-0.5">
            {p.tag}
          </span>
        )}
      </div>
      <div>
        <span className="cv-display text-[30px] text-strong">{formatCents(p.priceCents)}</span>
        {p.priceCents > 0 && <span className="text-sm text-muted font-semibold">{t.billingTab.perMonth}</span>}
        <div className="text-sm text-muted mt-0.5">
          {p.tier === "free" ? t.billingTab.noCredits : t.billingTab.creditsIncluded(formatCents(p.creditsCents))}
        </div>
      </div>
      <div className="flex flex-col gap-[7px]">
        {p.feats.map((f) => (
          <div key={f} className="flex items-start gap-2 text-sm text-body leading-snug">
            <span className="mt-px shrink-0 inline-flex text-[var(--forest-500,#3c6b1e)]">
              <CheckIcon size={14} />
            </span>
            {f}
          </div>
        ))}
      </div>
      <div className="flex-1" />
      {on ? (
        <button disabled className="btn-ghost w-full inline-flex items-center justify-center gap-2 disabled:opacity-100 disabled:cursor-default">
          <CheckIcon size={14} /> {t.billingTab.currentPlan}
        </button>
      ) : p.tier === "free" ? (
        // « Revenir au gratuit » is a DOWNGRADE — it only exists relative to a KNOWN
        // paid plan. Unknown tier ⇒ no button at all (never a wrong claim).
        tierKnown ? (
          <button
            onClick={instant ? () => onPick("free") : onPortal}
            disabled={(!billingAvailable && !instant) || !!busy}
            className="btn-ghost w-full inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-default"
          >
            {busy === "portal" ? (
              <>
                <span className="login-spin" /> {t.billingTab.opening}
              </>
            ) : (
              t.billingTab.backToFree
            )}
          </button>
        ) : null
      ) : (
        <button
          onClick={() => onPick(p.tier)}
          disabled={(!billingAvailable && !instant) || !!busy}
          className="btn-primary w-full inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-default"
        >
          {busy === `tier:${p.tier}` ? (
            <>
              <span className="login-spin" /> {t.billingTab.oneMoment}
            </>
          ) : !isPaid ? (
            t.billingTab.subscribe
          ) : TIER_RANK[p.tier] > TIER_RANK[currentTier] ? (
            t.billingTab.choosePlan
          ) : (
            t.billingTab.downgrade
          )}
        </button>
      )}
    </div>
  );
}

/** Confirmation before an in-place tier change (upgrade = prorated now, downgrade
 *  = credited next cycle). */
export function ChangeTierConfirm({
  tier,
  currentTier,
  onConfirm,
  onCancel,
}: {
  tier: string;
  currentTier: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const target = planTiers(t).find((p) => p.tier === tier);
  const up = (TIER_RANK[tier] ?? 0) > (TIER_RANK[currentTier] ?? 0);
  const price = formatCents(target?.priceCents ?? 0);
  return (
    <ConfirmDialog
      title={up ? t.billingTab.upgradeTitle(target?.name ?? "") : t.billingTab.downgradeTitle(target?.name ?? "")}
      message={
        up
          ? t.billingTab.upgradeBody(target?.name ?? "", price)
          : t.billingTab.downgradeBody(target?.name ?? "", price)
      }
      confirmLabel={up ? t.billingTab.confirmChange : t.billingTab.downgrade}
      danger={false}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

/** Shown to a member of an org: personal plans don't apply (per-seat billing is
 *  administered in the console). Owners/admins get a link into the admin console. */
export function OrgManagedBilling({
  orgProfile,
  host,
}: {
  orgProfile: OrgProfileInfo;
  host: Host;
}) {
  const t = useT();
  const canManage = orgProfile.role === "owner" || orgProfile.role === "admin";
  const openAdmin = host.org?.openAdmin;
  return (
    <div className="flex flex-col gap-5">
      <section>
        <div className="cv-eyebrow mb-3">{t.billingTab.billingEyebrow}</div>
        <div className="settings-card pad flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="shrink-0 text-[var(--forest-500,#3c6b1e)]">
              <ShieldIcon size={16} />
            </span>
            <span className="text-base font-semibold text-strong">
              {t.billingTab.orgManaged}
            </span>
          </div>
          <div className="text-sm text-body leading-snug">
            {t.billingTab.orgCovered(orgProfile.organizationName ? ` ${orgProfile.organizationName}` : "")}
          </div>
          {canManage && openAdmin && (
            <button onClick={() => openAdmin()} className="btn-primary self-start mt-1">
              {t.billingTab.manageInAdmin}
            </button>
          )}
          {canManage && !openAdmin && (
            <div className="text-xs text-muted">
              {t.billingTab.manageInAdminHint(BRAND.name)}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/** The prepaid-credits progress bar for the current period. Le mode gratuit n'atteint
 *  jamais ce composant (`BillingTab` rend `FreeModeBilling` avant) ; s'il y arrivait,
 *  un `unlimited` se lit comme « pas de jauge » plutôt que « 0 € restants ». */
export function CreditsMeter({ credits }: { credits: CreditBalance }) {
  const pct =
    credits.allotmentCents > 0
      ? Math.min(100, Math.round((credits.consumedCents / credits.allotmentCents) * 100))
      : 0;
  const t = useT();
  if (credits.unlimited) return null;
  return (
    <section>
      <div className="cv-eyebrow mb-3">{t.billingTab.creditsEyebrow}</div>
      <div className="settings-card pad">
        <div>
          <div className="flex items-baseline justify-between mb-2 text-sm text-body">
            <span>
              <b className="text-strong">{formatCents(Math.max(0, credits.balanceCents))}</b>{" "}
              {t.billingTab.remainingOf(formatCents(Math.max(0, credits.balanceCents)), formatCents(credits.allotmentCents))}
            </span>
            <span className="text-xs text-muted">{pct}%</span>
          </div>
          <div className="h-2 bg-surface-sunken rounded-[var(--radius-pill)] overflow-hidden">
            {/* Width is data-driven (runtime %), so it stays an inline style. */}
            <div
              className={`h-full rounded-[var(--radius-pill)] ${
                credits.blocked ? "bg-[var(--red-500,#d4493f)]" : "bg-[var(--forest-500,#3c6b1e)]"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {credits.blocked && <CreditsExhausted />}
        </div>
      </div>
    </section>
  );
}
