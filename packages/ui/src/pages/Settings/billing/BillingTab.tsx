import { useEffect, useRef, useState, useCallback } from "react";
import { ShieldIcon } from "../../../components/brand";
import { useHost } from "../../../host";
import type { OrgProfileInfo } from "../../../host";
import { useAuth } from "../../../state/useAuth";
import { useAppDispatch, useAppSelector } from "../../../state/redux";
import { selectBillingCache } from "../../../state/settingsCache";
import { loadBilling, pollBilling } from "../../../state/settingsPrefetch";
import { PLAN_TIERS, knownTier, tierAction } from "../../../state/billing";
import { OrgManagedBilling, CreditsMeter, ChangeTierConfirm, PlanCard } from "./BillingParts";

interface Props {
  /** The signed-in member's org authorization (null/undefined = solo user). */
  orgProfile?: OrgProfileInfo | null;
}

/**
 * Individual (per-person) billing. Reads the real subscription + prepaid credit
 * balance from `host.billing` and drives Stripe Checkout / portal. When the host
 * has no billing capability (e.g. the browser preview) the tiers still render as
 * information, with the actions disabled.
 *
 * When the account belongs to an org, billing is handled at the ORG level
 * (per-seat) — the individual plans are hidden and replaced by an org-managed
 * notice (mirrors the backend `ORG_BILLING_REQUIRED` guard on the checkout).
 */
export function BillingTab({ orgProfile }: Props) {
  const host = useHost();
  const billing = host.billing;
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // Subscription + credits are prefetched into Redux on Settings arrival
  // (`settingsPrefetch`) — read them from the cache so re-entering this tab is
  // instant. The checkout-return poll below writes fresh data back through the
  // same cache.
  const { sub, credits, loaded } = useAppSelector(selectBillingCache);
  // `busy` marks WHICH action is in flight so only that button spins:
  // `"portal"` or `tier:<slug>` (checkout/change), else null.
  const [busy, setBusy] = useState<string | null>(null);
  // A user-facing reason the last checkout/portal/change action opened nothing
  // (signed out, already subscribed, no Stripe customer, backend error) — so the
  // button never fails silently. Cleared when a new action starts.
  const [error, setError] = useState<string | null>(null);
  // A pending in-app tier change awaiting confirmation.
  const [confirmTier, setConfirmTier] = useState<string | null>(null);
  /** Cancels the in-flight checkout-return poll, if any. */
  const pollRef = useRef<(() => void) | null>(null);

  const refresh = useCallback(async () => {
    await loadBilling(host, dispatch, userId);
  }, [host, dispatch, userId]);

  // Re-fetch a few times after returning from Checkout: the subscription only
  // flips once Stripe's webhook lands (a second or two after the redirect), so a
  // single refresh would still read the old/free state. The loop itself is shared
  // with the chat store, which refreshes on the same deep-link return (rule 9).
  const pollRefresh = useCallback(
    (attempts = 6) => {
      pollRef.current?.();
      pollRef.current = pollBilling(host, dispatch, userId, attempts);
    },
    [host, dispatch, userId],
  );

  // Initial subscription/credits come from the Settings prefetch cache; this tab
  // only needs to clear its poll timer on unmount.
  useEffect(() => {
    return () => {
      pollRef.current?.();
    };
  }, []);

  // Refresh when the app returns from Stripe Checkout (desktop deep link).
  useEffect(() => {
    if (!billing?.onReturn) return;
    return billing.onReturn(() => pollRefresh());
  }, [billing, pollRefresh]);

  // UNKNOWN (null) is not "free": no host billing slot, a failed fetch or a load still
  // in flight must mark NO card as the current one — claiming « 0 € · Abonnement actuel »
  // to a paying account is worse than showing nothing (`knownTier`).
  const currentTier = knownTier(sub);
  const isPaid = !!currentTier && currentTier !== "free";
  // Mode testeur du DÉPLOIEMENT — offert seulement si l'hôte sait l'exécuter : un libellé
  // « S'octroyer » sans `selfGrant` derrière serait un bouton mort (aperçu, mobile).
  const testerMode = sub?.selfGrantEnabled === true && !!billing?.selfGrant;
  const finalizing = sub?.status === "pending_checkout";
  // Le déploiement encaisse-t-il ? Les cartes restent AFFICHÉES (même offre, mêmes
  // montants — la grille ne dépend pas de Stripe, elle vient du catalogue), seules les
  // actions se grisent. `undefined` = inconnu ⇒ on laisse ouvert, le 503 dira pourquoi.
  const billingOpen = sub?.billingEnabled !== false;

  /** Fallback when a rejection isn't an Error with a message. */
  const GENERIC_ERR = "Impossible d'ouvrir la page de paiement. Réessayez.";

  async function checkout(tier: string) {
    if (!billing) return;
    setBusy(`tier:${tier}`);
    setError(null);
    try {
      await billing.startCheckout(tier);
      // The plan flips after the webhook; poll so it appears without a manual
      // refresh even if the deep-link return is missed.
      pollRefresh();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : GENERIC_ERR);
    } finally {
      setBusy(null);
    }
  }

  async function doChangeTier(tier: string) {
    if (!billing?.changeTier) return;
    setBusy(`tier:${tier}`);
    setError(null);
    try {
      await billing.changeTier(tier);
      await refresh();
      pollRefresh(3);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : GENERIC_ERR);
    } finally {
      setBusy(null);
    }
  }

  async function portal() {
    if (!billing) return;
    setBusy("portal");
    setError(null);
    try {
      await billing.openPortal();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : GENERIC_ERR);
    } finally {
      setBusy(null);
    }
  }

  // Mode TESTEUR : ni Stripe ni navigateur — le palier est posé côté serveur, qui relit
  // l'interrupteur global lui-même. `"free"` est le RETRAIT (testable dans les deux sens).
  async function selfGrant(tier: string) {
    if (!billing) return;
    setBusy(`tier:${tier}`);
    setError(null);
    try {
      if (tier === "free") await billing.selfRevoke?.();
      else await billing.selfGrant?.(tier);
      await refresh();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : GENERIC_ERR);
    } finally {
      setBusy(null);
    }
  }

  // Où va un clic sur un autre palier : décision PURE et testée (`state/billing.ts`) — sa
  // branche « un octroi n'est pas un abonné » est celle qui avait tué le tunnel d'achat.
  function onPickTier(tier: string) {
    const act = tierAction({ testerMode, isPaid, isGranted: sub?.isGranted, canChangeTier: !!billing?.changeTier });
    if (act === "self-grant") void selfGrant(tier);
    else if (act === "change-tier") setConfirmTier(tier);
    else void checkout(tier);
  }

  // Org members are billed per-seat by their organization — never individually.
  if (orgProfile) return <OrgManagedBilling orgProfile={orgProfile} host={host} />;

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--red-500,#d4493f)] bg-surface-card px-3.5 py-2.5 text-sm"
        >
          <span className="mt-px shrink-0 text-[var(--red-500,#d4493f)]">
            <ShieldIcon size={14} />
          </span>
          <span className="flex-1 text-body">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 text-xs text-muted underline"
          >
            Fermer
          </button>
        </div>
      )}
      <section>
        <div className="cv-eyebrow mb-3">VOTRE ABONNEMENT</div>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
          {PLAN_TIERS.map((p) => (
            <PlanCard
              key={p.tier}
              p={p}
              on={currentTier === p.tier}
              isPaid={isPaid}
              currentTier={currentTier ?? "free"}
              tierKnown={currentTier !== null}
              busy={busy}
              billingAvailable={!!billing && billingOpen}
              instant={testerMode}
              onPick={onPickTier}
              onPortal={portal}
            />
          ))}
        </div>
        {/* Loaded, a billing host exists, and still no subscription: the fetch
            failed (signed out, backend down). Say so — otherwise the grid simply
            marks no card and reads as "I have no plan". */}
        {/* Le bouton est le même ; ce qu'il déclenche ne l'est pas. Une ligne suffit —
            sans elle, un « S'abonner » qui n'encaisse rien laisse croire à un paiement. */}
        {testerMode && (
          <div className="mt-2 text-xs text-muted">
            Sur cette version, l'abonnement est appliqué immédiatement et sans paiement.
          </div>
        )}
        {!billingOpen && !testerMode && (
          <div className="mt-2 text-xs text-muted">
            Les abonnements ne sont pas encore ouverts sur cette version — l'offre ci-dessus est
            affichée à titre indicatif.
          </div>
        )}
        {loaded && !currentTier && !!billing && (
          <div className="mt-2 text-xs text-muted">
            Votre abonnement n'a pas pu être lu pour l'instant — vérifiez votre connexion, puis
            rouvrez cet onglet.
          </div>
        )}
        {finalizing && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted">
            <span className="login-spin" /> Finalisation de votre abonnement…
          </div>
        )}
        {isPaid && sub?.cancelAtPeriodEnd && (
          <div className="mt-2 text-xs text-[var(--amber-600,#b45309)]">
            Votre abonnement se termine à la fin de la période en cours. Réactivez-le depuis « Ouvrir
            le portail ».
          </div>
        )}
      </section>

      {credits && <CreditsMeter credits={credits} />}

      <section>
        <div className="cv-eyebrow mb-3">FACTURATION</div>
        <div className="settings-card">
          <div className="flex items-center gap-3.5 px-[18px] py-4">
            <span className="w-[46px] h-8 rounded-[6px] bg-[#635bff] text-white inline-flex items-center justify-center font-display font-extrabold text-xs tracking-[0.01em] shrink-0">
              stripe
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-base font-semibold text-strong">Géré par Stripe</div>
              <div className="text-xs text-muted">
                Moyen de paiement, factures et reçus dans le portail sécurisé.
              </div>
            </div>
            <button
              onClick={portal}
              disabled={!billing || !billingOpen || !!busy}
              className="btn-primary shrink-0 inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-default"
            >
              {busy === "portal" ? (
                <>
                  <span className="login-spin" /> Ouverture…
                </>
              ) : (
                "Ouvrir le portail"
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-2.5 text-xs text-muted">
          <ShieldIcon size={13} /> Paiements sécurisés par Stripe. La facturation et vos reçus sont
          gérés depuis le portail Stripe.
        </div>
      </section>

      {!billing && (
        <div className="text-xs text-muted">
          La gestion de l'abonnement n'est pas disponible sur cette plateforme.
        </div>
      )}

      {confirmTier && (
        <ChangeTierConfirm
          tier={confirmTier}
          currentTier={currentTier ?? "free"}
          onConfirm={() => {
            const t = confirmTier;
            setConfirmTier(null);
            void doChangeTier(t);
          }}
          onCancel={() => setConfirmTier(null)}
        />
      )}
    </div>
  );
}
