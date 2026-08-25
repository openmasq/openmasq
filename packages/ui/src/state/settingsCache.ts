import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  BillingSubscription,
  CreditBalance,
  UpdatesCurrent,
  DesktopRelease,
  DesktopChannelReleases,
} from "../host";
import type { ReleaseNote } from "./releaseNotes";
import type { RootState } from "./redux";

/**
 * Settings-screen data CACHE (Redux). The Paiement / Usage / Versions tabs each
 * used to fetch their remote data (subscription + prepaid credits, the published
 * releases + install permissions, the Contentful release notes) on their OWN
 * mount — so every visit to a tab re-hit the network and showed a visible loading
 * delay. Instead we fetch ALL of it ONCE on arrival at Settings (see
 * `settingsPrefetch.ts`, mounted by `SettingsView`) and stash it here; the tabs
 * become pure readers of this slice, so re-entering a tab is instant.
 *
 * `billing` is per-ACCOUNT (subscription + credits differ by user), so it carries
 * the `userId` it was fetched for and the prefetch re-loads it on account switch.
 * `updates` / `releaseNotes` are device/global and cached across accounts.
 */

export interface BillingCache {
  sub: BillingSubscription | null;
  credits: CreditBalance | null;
  /** The account this billing snapshot belongs to (null = signed-out / no auth). */
  userId: string | null;
  loaded: boolean;
}

export interface UpdatesCache {
  current: UpdatesCurrent | null;
  releases: DesktopRelease[];
  canPin: boolean;
  allChannels: DesktopChannelReleases[];
  crossEnv: boolean;
  /** A load error message; kept so a failed load can still be surfaced. When set,
   *  `loaded` stays false so the next Settings visit re-attempts the fetch. */
  error: string | null;
  loaded: boolean;
}

export interface ReleaseNotesCache {
  notes: ReleaseNote[];
  loaded: boolean;
}

export interface SettingsCacheState {
  billing: BillingCache;
  updates: UpdatesCache;
  releaseNotes: ReleaseNotesCache;
}

const initialState: SettingsCacheState = {
  billing: { sub: null, credits: null, userId: null, loaded: false },
  updates: {
    current: null,
    releases: [],
    // Default true so a host without the capability (older preload) keeps showing
    // the picker; a host that exposes permissions overrides this on load.
    canPin: true,
    allChannels: [],
    crossEnv: false,
    error: null,
    loaded: false,
  },
  releaseNotes: { notes: [], loaded: false },
};

const slice = createSlice({
  name: "settingsCache",
  initialState,
  reducers: {
    setBillingCache(
      state,
      action: PayloadAction<{
        sub: BillingSubscription | null;
        credits: CreditBalance | null;
        userId: string | null;
      }>,
    ) {
      state.billing = { ...action.payload, loaded: true };
    },
    /** Full updates snapshot on success (`error:null`). */
    setUpdatesCache(state, action: PayloadAction<Omit<UpdatesCache, "loaded">>) {
      state.updates = { ...action.payload, loaded: !action.payload.error };
    },
    setReleaseNotesCache(state, action: PayloadAction<ReleaseNote[]>) {
      state.releaseNotes = { notes: action.payload, loaded: true };
    },
    /** Drop everything (e.g. on sign-out) so the next visit re-fetches clean. */
    resetSettingsCache() {
      return initialState;
    },
  },
});

export const {
  setBillingCache,
  setUpdatesCache,
  setReleaseNotesCache,
  resetSettingsCache,
} = slice.actions;

export const settingsCacheReducer = slice.reducer;

export const selectBillingCache = (s: RootState): BillingCache => s.settingsCache.billing;

/**
 * The billing snapshot as it applies to `userId` — the cache is per-ACCOUNT, so a
 * snapshot fetched for someone else (or not fetched yet, or an unresolved account) is
 * **unknown**, never "free". Both nulls read as unknown downstream, and unknown never
 * greys a model nor refuses a send (`send/modelAvailability.ts`) — the send gate and the
 * gateway re-check server-side. Returning the raw cache instead would let account A's
 * free tier grey account B's paid models for a frame.
 *
 * This is what the chat store reads, so the model picker and Réglages → Paiement can
 * never disagree about the plan (rule 9): one cache, one fetch path (`loadBilling`).
 */
export function billingFor(
  c: BillingCache,
  userId: string | null | undefined,
): { sub: BillingSubscription | null; credits: CreditBalance | null } {
  if (!c.loaded || userId === undefined || c.userId !== userId) return { sub: null, credits: null };
  return { sub: c.sub, credits: c.credits };
}
export const selectUpdatesCache = (s: RootState): UpdatesCache => s.settingsCache.updates;
export const selectReleaseNotesCache = (s: RootState): ReleaseNotesCache =>
  s.settingsCache.releaseNotes;
