import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { BillingSubscription, CreditBalance, Host } from "../../host";
import { store as reduxStore } from "../redux";
import { billingFor, selectBillingCache } from "../settings/settingsCache";
import { loadBilling, pollBilling } from "../settings/settingsPrefetch";

/**
 * The SOLO account's prepaid credits + subscription, read from the SHARED billing cache
 * (rule 9: one copy — a private snapshot loaded at boot kept greying paid models after a
 * checkout). The store lives above the redux Provider, hence `useSyncExternalStore`.
 * The refs let the render-stable send pipeline read the latest without a dep change.
 */
export function useBilling(host: Host, userId: string | null | undefined) {
  const billingCache = useSyncExternalStore(reduxStore.subscribe, () =>
    selectBillingCache(reduxStore.getState()),
  );
  const { sub: personalSub, credits: personalCredits } = useMemo(
    () => billingFor(billingCache, userId),
    [billingCache, userId],
  );
  const personalCreditsRef = useRef<CreditBalance | null>(null);
  personalCreditsRef.current = personalCredits;
  const personalSubRef = useRef<BillingSubscription | null>(null);
  personalSubRef.current = personalSub;

  // Fill the cache per ACCOUNT as soon as it resolves: the picker greys on it, so it
  // must not wait for a visit to Réglages. `loadBilling` stays the single fetch path.
  useEffect(() => {
    if (!host.billing || userId === undefined) return;
    void loadBilling(host, reduxStore.dispatch, userId);
  }, [host, userId]);

  // Back from checkout (the billing deep link): poll, because the plan only flips once
  // the payment provider confirms. The Paiement tab may not be mounted — this refresh is
  // what un-greys the picker in the session that paid.
  useEffect(() => {
    const billing = host.billing;
    if (!billing?.onReturn || userId === undefined) return;
    let cancel: (() => void) | undefined;
    const off = billing.onReturn(() => {
      cancel?.();
      cancel = pollBilling(host, reduxStore.dispatch, userId);
    });
    return () => {
      cancel?.();
      off?.();
    };
  }, [host, userId]);

  return { personalSub, personalCredits, personalSubRef, personalCreditsRef };
}
