import { useEffect } from "react";
import { useHost, type Host, type DesktopChannelReleases } from "../../host";
import { useAuth } from "../auth/useAuth";
import { useAppDispatch, useAppSelector, type AppDispatch } from "../redux";
import {
  setBillingCache,
  setUpdatesCache,
  setReleaseNotesCache,
  selectBillingCache,
  selectUpdatesCache,
  selectReleaseNotesCache,
} from "./settingsCache";
import type { ReleaseNote } from "./releaseNotes";

// The Settings-screen prefetch: fetch the Paiement / Versions data ONCE on arrival
// at Settings and cache it in Redux (`settingsCache`), so the tabs read it
// instantly instead of each re-fetching on its own mount. These `load*` helpers
// are the SINGLE fetch path — reused both here and by the tabs' explicit refresh
// actions (checkout return poll, manual update check) so the logic never drifts.

/** Fetch the account's subscription + prepaid credits and cache them. */
export async function loadBilling(
  host: Host,
  dispatch: AppDispatch,
  userId: string | null,
): Promise<void> {
  const billing = host.billing;
  if (!billing) {
    dispatch(setBillingCache({ sub: null, credits: null, userId }));
    return;
  }
  const [sub, credits] = await Promise.all([
    billing.getSubscription().catch(() => null),
    billing.getCredits().catch(() => null),
  ]);
  dispatch(setBillingCache({ sub, credits, userId }));
}

/**
 * Re-fetch the billing snapshot a few times after the user returns from Stripe
 * Checkout: the plan only flips once Stripe's webhook lands (a second or two AFTER the
 * redirect), so a single refresh still reads the old/free state. Returns a cancel
 * function. Shared by the Paiement tab and the chat store, which both refresh on the
 * SAME deep-link return — the tab may not even be mounted (the upgrade CTA also lives
 * in the chat), and the store's copy is what un-greys the model picker.
 */
export function pollBilling(
  host: Host,
  dispatch: AppDispatch,
  userId: string | null,
  attempts = 6,
  intervalMs = 2000,
): () => void {
  let left = attempts;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;
  const tick = async () => {
    await loadBilling(host, dispatch, userId);
    left -= 1;
    if (!cancelled && left > 0) timer = setTimeout(tick, intervalMs);
  };
  void tick();
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}

/** Fetch the install identity + published releases + permissions and cache them. */
export async function loadUpdates(host: Host, dispatch: AppDispatch): Promise<void> {
  const updates = host.updates;
  if (!updates) {
    dispatch(
      setUpdatesCache({
        current: null,
        releases: [],
        canPin: true,
        allChannels: [],
        crossEnv: false,
        error: null,
      }),
    );
    return;
  }
  try {
    const perms = updates.permissions
      ? updates.permissions().catch(() => ({ allow_self_pin: true }))
      : Promise.resolve({ allow_self_pin: true });
    // Each source is guarded INDEPENDENTLY so one failing endpoint never blanks the
    // whole panel: a `current()` reject used to fall to the outer catch → `current:null`
    // + an `error` that REPLACES the history (hiding even the always-injectable running
    // build) — the reported "history shows in dev but not staging". Now current/list
    // degrade on their own and the panel still renders what loaded.
    const [cur, list, perm] = await Promise.all([
      updates.current().catch(() => null),
      updates.list().catch(() => ({ channel: "", releases: [] })),
      perms,
    ]);
    const allowed = perm?.allow_self_pin ?? true;
    // Privileged + capable host → pull the staging+production list so the picker
    // can offer switching environments. Errors degrade to same-channel.
    let allChannels: DesktopChannelReleases[] = [];
    let crossEnv = false;
    if (allowed && updates.listAll) {
      try {
        const all = await updates.listAll();
        crossEnv = !!all?.privileged;
        allChannels = all?.channels ?? [];
      } catch {
        crossEnv = false;
        allChannels = [];
      }
    }
    dispatch(
      setUpdatesCache({
        current: cur,
        releases: list?.releases ?? [],
        canPin: allowed,
        allChannels,
        crossEnv,
        error: null,
      }),
    );
  } catch (e) {
    dispatch(
      setUpdatesCache({
        current: null,
        releases: [],
        canPin: true,
        allChannels: [],
        crossEnv: false,
        error: e instanceof Error ? e.message : "Échec du chargement",
      }),
    );
  }
}

/** Fetch the published release notes (Contentful via analytics-fn) and cache them. */
export async function loadReleaseNotes(host: Host, dispatch: AppDispatch): Promise<void> {
  const url = host.releaseNotesUrl;
  if (!url) {
    dispatch(setReleaseNotesCache([]));
    return;
  }
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = (await r.json()) as { items?: ReleaseNote[] };
    dispatch(setReleaseNotesCache(Array.isArray(data.items) ? data.items : []));
  } catch {
    // A failed fetch caches an empty list (loaded:true) — the notes are optional
    // decoration; the version list still renders without them.
    dispatch(setReleaseNotesCache([]));
  }
}

/**
 * Mounted ONCE by `SettingsView`: on arrival at Settings, warm every tab's remote
 * data into the cache. Each source is fetched only when its cache is empty
 * (billing additionally re-loads when the signed-in account changed), so
 * re-entering Settings — or switching between tabs — never re-fetches.
 */
export function useSettingsPrefetch(): void {
  const host = useHost();
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const billing = useAppSelector(selectBillingCache);
  const updates = useAppSelector(selectUpdatesCache);
  const releaseNotes = useAppSelector(selectReleaseNotesCache);

  // Billing is per-account: (re)load when never loaded OR the account changed.
  useEffect(() => {
    if (!billing.loaded || billing.userId !== userId) void loadBilling(host, dispatch, userId);
  }, [host, dispatch, userId, billing.loaded, billing.userId]);

  useEffect(() => {
    if (!updates.loaded) void loadUpdates(host, dispatch);
  }, [host, dispatch, updates.loaded]);

  useEffect(() => {
    if (!releaseNotes.loaded) void loadReleaseNotes(host, dispatch);
  }, [host, dispatch, releaseNotes.loaded]);
}
