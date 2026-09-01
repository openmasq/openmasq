import { useEffect } from "react";
import { fetchFlags } from "../../analytics/posthog";
import { setFeatureAccessFromFlags } from "./featureAccess";
import { BRAND } from "@openmasq/branding";

/**
 * The TRANSPORT of access flags — the counterpart to `featureAccess.ts`, which only holds
 * the resolved value and the predicates.
 *
 * Three sources, in this order, and the order IS the fix:
 *  1. the compiled defaults (`@openmasq/catalog`) — already in place before any code here;
 *  2. the CACHE of the last known response, applied SYNCHRONOUSLY at startup;
 *  3. the relay, when it answers.
 *
 * ⚠️ Step 2 is not an optimisation. Without it, every launch shows the app
 * with the defaults during the network round trip, then a section DISAPPEARS before the
 * user's eyes a second later — and offline it would never disappear
 * at all. A closed door must be closed from the first frame, and stay so with no network.
 *
 * ⚠️ And the cache NEVER closes over a failure: an unreadable or absent response
 * leaves in place what we had, and a first offline launch keeps the defaults
 * ("the product as shipped"). Nothing here can remove a section because
 * the network went down.
 */

const CACHE_KEY = `${BRAND.slug}.featureFlags`;
/** The fleet doesn't need a second-by-second toggle: a screen that appears or
 *  disappears under the cursor is worse than ten minutes of delay. */
const REFRESH_MS = 15 * 60 * 1000;

type FlagMap = Record<string, boolean | string>;

function readCache(): FlagMap | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as FlagMap) : null;
  } catch {
    // No localStorage (SSR preview, restricted context): stay on the defaults.
    return null;
  }
}

function writeCache(flags: FlagMap): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(flags));
  } catch {
    /* quota / storage unavailable — the next launch will retry the network */
  }
}

/** The cache applies SYNCHRONOUSLY, at import — even before the first render, so
 *  before a closed section could flicker on screen. */
const cached = readCache();
if (cached) setFeatureAccessFromFlags(cached);

async function refresh(): Promise<void> {
  const flags = await fetchFlags();
  if (!flags) return; // no transport / offline / unreadable ⇒ keep the state
  setFeatureAccessFromFlags(flags);
  writeCache(flags);
}

/**
 * Mounted by `AppShell` — so by EVERY host app, with none of them needing to remember it.
 * `configureAnalytics` (the relay's URL, the attestation key) has already run by
 * that point: hosts do it before rendering React. Never rejects.
 */
export function useFeatureFlags(): void {
  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, []);
}
