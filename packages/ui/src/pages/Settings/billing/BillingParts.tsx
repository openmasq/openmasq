import { CheckIcon, ShieldIcon } from "../../../components/brand";
import { ConfirmDialog } from "../../../components/feedback/ConfirmDialog";
import type { CreditBalance, Host, OrgProfileInfo } from "../../../host";
import { PLAN_TIERS, formatCents, type PlanTier } from "../../../state/billing";
import { CreditsExhausted } from "./CreditsMeter";
import { BRAND } from "@openmasq/branding";

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
            Recommandé
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
        {p.priceCents > 0 && <span className="text-sm text-muted font-semibold"> / mois</span>}
        <div className="text-sm text-muted mt-0.5">
          {p.tier === "free" ? "Sans crédits inclus" : `${formatCents(p.creditsCents)} de crédits inclus`}
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
          <CheckIcon size={14} /> Abonnement actuel
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
                <span className="login-spin" /> Ouverture…
              </>
            ) : (
              "Revenir au gratuit"
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
              <span className="login-spin" /> Un instant…
            </>
          ) : !isPaid ? (
            "S'abonner"
          ) : TIER_RANK[p.tier] > TIER_RANK[currentTier] ? (
            "Choisir cet abonnement"
          ) : (
            "Rétrograder"
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
  const target = PLAN_TIERS.find((p) => p.tier === tier);
  const up = (TIER_RANK[tier] ?? 0) > (TIER_RANK[currentTier] ?? 0);
  const price = formatCents(target?.priceCents ?? 0);
  return (
    <ConfirmDialog
      title={up ? `Passer à l'abonnement ${target?.name} ?` : `Rétrograder vers ${target?.name} ?`}
      message={
        up
          ? `Votre abonnement passe immédiatement à ${target?.name} (${price} / mois). La différence est facturée au prorata pour la période en cours.`
          : `Votre abonnement passe à ${target?.name} (${price} / mois). Le crédit correspondant est appliqué au prochain cycle de facturation.`
      }
      confirmLabel={up ? "Confirmer le changement" : "Rétrograder"}
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
  const canManage = orgProfile.role === "owner" || orgProfile.role === "admin";
  const openAdmin = host.org?.openAdmin;
  return (
    <div className="flex flex-col gap-5">
      <section>
        <div className="cv-eyebrow mb-3">FACTURATION</div>
        <div className="settings-card pad flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="shrink-0 text-[var(--forest-500,#3c6b1e)]">
              <ShieldIcon size={16} />
            </span>
            <span className="text-base font-semibold text-strong">
              Facturation gérée par votre organisation
            </span>
          </div>
          <div className="text-sm text-body leading-snug">
            Votre accès est couvert par l'organisation
            {orgProfile.organizationName ? ` ${orgProfile.organizationName}` : ""} (facturation par
            siège). Les abonnements individuels ne s'appliquent pas à un membre d'une organisation.
          </div>
          {canManage && openAdmin && (
            <button onClick={() => openAdmin()} className="btn-primary self-start mt-1">
              Gérer dans la console admin
            </button>
          )}
          {canManage && !openAdmin && (
            <div className="text-xs text-muted">
              Gérez l'abonnement de l'organisation depuis la console d'administration {BRAND.name}.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/** The prepaid-credits progress bar for the current period. */
export function CreditsMeter({ credits }: { credits: CreditBalance }) {
  const pct =
    credits.allotmentCents > 0
      ? Math.min(100, Math.round((credits.consumedCents / credits.allotmentCents) * 100))
      : 0;
  return (
    <section>
      <div className="cv-eyebrow mb-3">CRÉDITS · CETTE PÉRIODE</div>
      <div className="settings-card pad">
        <div>
          <div className="flex items-baseline justify-between mb-2 text-sm text-body">
            <span>
              <b className="text-strong">{formatCents(Math.max(0, credits.balanceCents))}</b>{" "}
              restants sur {formatCents(credits.allotmentCents)}
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
