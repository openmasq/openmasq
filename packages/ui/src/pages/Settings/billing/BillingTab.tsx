import { useEffect, useRef, useState, useCallback } from "react";
import { ShieldIcon } from "../../../components/brand";
import { useHost } from "../../../host";
import type { OrgProfileInfo } from "../../../host";
import { useAuth } from "../../../state/useAuth";
import { useAppDispatch, useAppSelector } from "../../../state/redux";
import { selectBillingCache } from "../../../state/settingsCache";
import { loadBilling, pollBilling } from "../../../state/settingsPrefetch";
import { knownTier, planTiers, tierAction } from "../../../state/billing";
import { OrgManagedBilling, CreditsMeter, ChangeTierConfirm, PlanCard } from "./BillingParts";
import { FreeModeBilling } from "./FreeModeBilling";
import { useBillingActions } from "./useBillingActions";

import { useT } from "../../../i18n";
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

  // Subscription/credits come from the Settings prefetch cache; only clear the poll on unmount.
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

  // UNKNOWN (null) is not "free": no billing slot, a failed fetch or a load in flight must
  // mark NO card current — « 0 € · Abonnement actuel » to a paying account is worse (`knownTier`).
  const currentTier = knownTier(sub);
  const t = useT();
  const isPaid = !!currentTier && currentTier !== "free";
  // DEPLOYMENT tester mode — offered only if the host knows how to run it: a label
  // « S'octroyer » with no `selfGrant` behind it would be a dead button (aperçu, mobile).
  const testerMode = sub?.selfGrantEnabled === true && !!billing?.selfGrant;
  const finalizing = sub?.status === "pending_checkout";
  // Does the deployment take payments? The cards stay DISPLAYED (same offer, same
  // amounts — the grid doesn't depend on Stripe, it comes from the catalogue), only the
  // actions grey out. `undefined` = unknown ⇒ leave it open, the 503 will say why.
  const billingOpen = sub?.billingEnabled !== false;

  // The four money gestures + the busy/error pair they write (`useBillingActions`).
  const { busy, error, setError, checkout, changeTier, portal, selfGrant } = useBillingActions(
    billing,
    refresh,
    pollRefresh,
  );

  // Where a click on another tier goes: a PURE, tested decision (`state/billing.ts`) — its
  // "a grant is not a subscriber" branch is the one that had killed the checkout funnel.
  function onPickTier(tier: string) {
    const act = tierAction({ testerMode, isPaid, isGranted: sub?.isGranted, canChangeTier: !!billing?.changeTier });
    if (act === "self-grant") void selfGrant(tier);
    else if (act === "change-tier") setConfirmTier(tier);
    else void checkout(tier);
  }

  // FREE MODE for the deployment: nothing to sell, nothing to cap — checked before the org too.
  if (sub?.freeMode) return <FreeModeBilling credits={credits} />;
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
            {t.billingTab.close}
          </button>
        </div>
      )}
      <section>
        <div className="cv-eyebrow mb-3">{t.billingTab.yourSubscription}</div>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
          {planTiers(t).map((p) => (
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
        {/* The button is the same; what it triggers isn't. One line is enough —
            without it, a « S'abonner » that charges nothing suggests a payment. */}
        {testerMode && (
          <div className="mt-2 text-xs text-muted">
            {t.billingTab.testerNote}
          </div>
        )}
        {!billingOpen && !testerMode && (
          <div className="mt-2 text-xs text-muted">
            {t.billingTab.billingClosed}
          </div>
        )}
        {loaded && !currentTier && !!billing && (
          <div className="mt-2 text-xs text-muted">
            {t.billingTab.unreadable}
          </div>
        )}
        {finalizing && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted">
            <span className="login-spin" /> {t.billingTab.finalizing}
          </div>
        )}
        {isPaid && sub?.cancelAtPeriodEnd && (
          <div className="mt-2 text-xs text-[var(--amber-600,#b45309)]">
            {t.billingTab.cancelAtEnd}
          </div>
        )}
      </section>

      {credits && <CreditsMeter credits={credits} />}

      <section>
        <div className="cv-eyebrow mb-3">{t.billingTab.billingEyebrow}</div>
        <div className="settings-card">
          <div className="flex items-center gap-3.5 px-[18px] py-4">
            <span className="w-[46px] h-8 rounded-[6px] bg-[#635bff] text-white inline-flex items-center justify-center font-display font-extrabold text-xs tracking-[0.01em] shrink-0">
              stripe
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-base font-semibold text-strong">{t.billingTab.stripeManaged}</div>
              <div className="text-xs text-muted">
                {t.billingTab.stripeHint}
              </div>
            </div>
            <button
              onClick={portal}
              disabled={!billing || !billingOpen || !!busy}
              className="btn-primary shrink-0 inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-default"
            >
              {busy === "portal" ? (
                <>
                  <span className="login-spin" /> {t.billingTab.opening}
                </>
              ) : (
                t.billingTab.openPortal
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-2.5 text-xs text-muted">
          <ShieldIcon size={13} /> {t.billingTab.stripeSecure}
        </div>
      </section>

      {!billing && (
        <div className="text-xs text-muted">
          {t.billingTab.unavailableHere}
        </div>
      )}

      {confirmTier && (
        <ChangeTierConfirm
          tier={confirmTier}
          currentTier={currentTier ?? "free"}
          onConfirm={() => {
            const t = confirmTier;
            setConfirmTier(null);
            void changeTier(t);
          }}
          onCancel={() => setConfirmTier(null)}
        />
      )}
    </div>
  );
}
