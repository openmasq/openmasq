import { DESKTOP_EVENTS, makeSanitize, type Bucketers } from "@openmasq/analytics";
import type { EventName, TrackEvent } from "./events";

/**
 * Runtime allow-list — defence-in-depth on top of the TrackEvent union. Only the
 * keys named here survive; anything else a (mis-cast) call site attaches is
 * dropped before it can reach a sink. If you add a field to an event in
 * events.ts, add its key to `DESKTOP_EVENTS` too or it will be silently stripped.
 *
 * The LIST lives in `@openmasq/analytics` (`vocabulary/desktop.ts`) because the relay
 * reads the same one to decide what it admits; the TYPE it must agree with lives here,
 * and `satisfies` + the PARITY test (`sanitize.parity.test.ts`) hold both directions —
 * every field the vocabulary declares is listed, and nothing is listed that no event
 * carries — at the TYPE level, so a drift is a red typecheck that NAMES the key.
 */
export const ALLOWED = DESKTOP_EVENTS satisfies Record<EventName, readonly string[]>;

/** Per-field quantisers: `chars` (a count) and `ms` (a latency) are bucketed to
 *  coarse ranges so exact values can't fingerprint a user; every other field keeps
 *  its raw primitive. Passed to the shared allow-list walk (`makeSanitize`). */
const bucketers: Bucketers = { chars: bucket, ms: bucketMs, ttftMs: bucketMs };

/** Quantise a count into a coarse bucket label (avoids exact-length fingerprints). */
export function bucket(n: number): string {
  if (n <= 0) return "0";
  if (n <= 20) return "1-20";
  if (n <= 100) return "21-100";
  if (n <= 500) return "101-500";
  if (n <= 2000) return "501-2k";
  if (n <= 10000) return "2k-10k";
  return "10k+";
}

/** Quantise a duration in ms into a coarse latency bucket. Still coarse (no raw ms —
 *  privacy), but the tail above 10s is split so time-to-first-token can actually be
 *  tracked: ~73% of agentic TTFTs collapsed into a single opaque "10s+" before, so
 *  we couldn't tell 11s from 60s (see the model_latency analysis). */
export function bucketMs(n: number): string {
  if (n < 50) return "<50ms";
  if (n < 200) return "50-200ms";
  if (n < 500) return "200-500ms";
  if (n < 1000) return "500ms-1s";
  if (n < 3000) return "1-3s";
  if (n < 10000) return "3-10s";
  if (n < 20000) return "10-20s";
  if (n < 40000) return "20-40s";
  if (n < 60000) return "40-60s";
  return "60s+";
}

/**
 * Reduce a typed event to a sink-ready `{ name, props }`, keeping ONLY allow-listed
 * keys and bucketing the noisy numeric ones. Unknown event names yield no props.
 * The walk itself is the shared `@openmasq/analytics` `makeSanitize` (identical to
 * the extension's), configured here with the desktop's `ALLOWED` + `bucketers`.
 */
export const sanitize = makeSanitize<TrackEvent>({ allowed: ALLOWED, bucketers });
