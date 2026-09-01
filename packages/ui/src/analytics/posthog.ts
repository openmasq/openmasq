import { createSink } from "@openmasq/analytics";
import { BRAND } from "@openmasq/branding";

/**
 * The desktop analytics transport = the SHARED `@openmasq/analytics` sink, wired
 * with a localStorage-backed anonymous id. All the transport logic (relay-or-direct
 * PostHog, the double consent + Do-Not-Track/GPC gate, the neutral relay envelope,
 * fire-and-forget POST) lives in the shared package now — identical to the
 * extension's — so this file only supplies the desktop's id source + source tag.
 *
 * MANUAL events only: no posthog-js (its autocapture would scrape DOM text, a
 * privacy hole in an app whose whole point is hiding text).
 */

const ANON_KEY = `${BRAND.slug}.analytics.aid`;

/**
 * Where the platform's STABLE id comes from (desktop: the `installId` from `updates.json`, a
 * per-machine uuid that survives a wiped profile). A SOURCE, not a pushed value: the
 * sink waits on `getAnonId()`, so nothing can go out before it has answered.
 *
 * ⚠️ This is the 12/08 fix, and the shape matters. The old version pushed the id
 * from `main.tsx` via an `updates.current().then(adoptStableId).catch(() => {})` in
 * parallel with startup, betting that the sink's queue would hold longer
 * than the IPC round-trip. There are two ways to lose that bet, and they engrave their
 * result: if the queue goes first, or if `current()` fails / does not exist on
 * this platform, it minted an `anon-…` and PERSISTED it — the install could
 * never become stable again, since adoption overwrites nothing. Measured in PostHog:
 * 291 `anon-…` identities against 46 uuids, and a new one as recently as 12/08.
 */
let stableIdSource: (() => Promise<string | undefined>) | null = null;

/** Declare the source BEFORE the first event (see `main.tsx`). */
export function setStableIdSource(fn: () => Promise<string | undefined>): void {
  stableIdSource = fn;
}

/** One identity per session: the first resolution is memoized as-is. */
let pending: Promise<string> | null = null;

const read = (): string | null => {
  try {
    return localStorage.getItem(ANON_KEY);
  } catch {
    return null;
  }
};
const write = (id: string): void => {
  try {
    localStorage.setItem(ANON_KEY, id);
  } catch {
    /* localStorage unavailable — the id is valid for the session */
  }
};
const randomAnon = (): string =>
  "anon-" + Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * The order IS the feature:
 *  1. an id ALREADY set always wins — an existing install's continuity comes first, and
 *     that is what keeps its history from splitting into two "people";
 *  2. otherwise the platform's id, persisted: it survives a wiped localStorage;
 *  3. otherwise a random one — persisted ONLY if this platform has no source at
 *     all (mobile, web preview: the local one is then the best available). A source that
 *     exists but FAILED writes nothing down: the id is only valid for this session, and
 *     the next launch will try again to adopt the real one. Failing in churn is recoverable,
 *     failing in freeze is not.
 */
async function resolveId(): Promise<string> {
  const stored = read();
  if (stored) return stored;
  if (!stableIdSource) {
    const local = randomAnon();
    write(local);
    return local;
  }
  const platform = await stableIdSource().catch(() => undefined);
  if (platform) {
    write(platform);
    return platform;
  }
  return randomAnon();
}

function anonId(): Promise<string> {
  return (pending ??= resolveId());
}

/**
 * This installation's PostHog identity — the SAME resolution as the sink, not a
 * second one. Exposed for ONE reason: feedback ("avis"). A feedback report carrying this id
 * joins the events, errors and PostHog sessions of the installation that sent it —
 * without it, "Impossible d'utiliser mon modèle par défaut" cross-references no
 * telemetry at all and gets diagnosed blind.
 *
 * ⚠️ This is a deliberate JUNCTION between two channels kept separate everywhere
 * else: analytics is anonymous by construction, feedback is identified (verified token). The
 * junction exists only on the user's EXPLICIT gesture, under the modal's
 * "contexte technique" toggle, which announces it. Never wire this getter to
 * a channel that fires without a user gesture.
 */
export const analyticsDistinctId = (): Promise<string> => anonId();

/** Tests only: forget this session's memoized resolution. */
export function __resetAnalyticsIdForTests(): void {
  pending = null;
  stableIdSource = null;
}

export const { configureAnalytics, setAnalyticsConsent, setAnalyticsSuspended, sink, captureError, fetchFlags } = createSink({
  getAnonId: anonId,
  defaultSource: "desktop",
  logPrefix: "[analytics]",
});
