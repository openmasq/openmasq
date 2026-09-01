import { makeSanitize, type Bucketers } from "@openmasq/analytics";
import type { EventName, TrackEvent } from "./events";

/**
 * Runtime allow-list — defence-in-depth on top of the TrackEvent union. Only the
 * keys named here survive; anything else a (mis-cast) call site attaches is
 * dropped before it can reach a sink. If you add a field to an event in
 * events.ts, add its key here too or it will be silently stripped.
 */
// Exported `as const` for the PARITY test (`sanitize.parity.test.ts`): every field declared
// by the vocabulary is listed here, and the reverse holds too — at the TYPE level, so a
// drift is a red typecheck that NAMES the key (the « loopId retiré sans un mot » class of
// bug from the 13/08 audit can no longer happen).
export const ALLOWED = {
  app_open: [],
  section_change: ["section"],
  theme_toggle: ["theme"],
  language_change: ["locale"],
  new_chat: [],
  select_conversation: ["id"],
  delete_conversation: ["id"],
  send_message: ["chars", "redactions", "provider", "model"],
  stop: [],
  regenerate: [],
  copy_reply: [],
  avis_from_message: [],
  change_model: ["provider", "model"],
  default_model_set: ["model"],
  redaction_applied: ["count", "kinds"],
  engine_used: ["engine"],
  redaction_fallback_regex: [],
  token_usage: ["provider", "model", "input", "output", "cached", "cacheWrite"],
  model_latency: ["provider", "model", "ttftMs", "tokensPerSec", "output", "tools", "toolCount", "inputTokens"],
  connector_connect: ["provider"],
  connector_disconnect: ["provider"],
  connector_error: ["provider", "reason"],
  tool_called: ["server", "tool", "connector", "provider", "model", "loopId"],
  tool_error: ["server", "tool", "reason", "connector", "provider", "model", "family", "param", "attempt", "ms", "loopId"],
  tool_struggle: ["server", "tool", "kind", "provider", "model", "loopId"],
  tool_route_miss: ["kind", "offered", "available", "connector", "provider", "model", "loopId"],
  tool_route_rescue: ["connector", "tools", "provider", "model", "loopId"],
  tool_route_salvage: ["kind", "count", "provider", "model", "loopId"],
  tool_schema_blind: ["server", "tool", "verdict", "provider", "model", "loopId"],
  tool_result: ["connector", "tool", "ok", "ms", "provider", "model", "loopId"],
  redaction_kept: ["kind"],
  redaction_forced: ["kind", "source"],
  tool_loop_summary: [
    "provider", "model", "turns", "toolCalls", "ms",
    "routerOffered", "routerTotal", "loadToolsUnknown", "navClear", "navEscalated", "outcome", "reason",
    // ⚠️ `loopId` was missing HERE while the vocabulary declares it — the walk stripped it
    // WITHOUT A WORD and a laborious session's summary no longer joined its own
    // tool_called/tool_error (audit 13/08). `sanitize.parity.test.ts` now makes this class
    // of drift impossible.
    "loopId",
  ],
  run_python_failed: ["reason", "ms", "loopId"],
  tool_gate_blocked: ["kind", "tool", "connector", "provider", "model", "loopId"],
  send_error: ["provider", "model", "reason", "status", "requestId", "retries"],
  redaction_timing: ["engine", "model", "ms", "cold", "ok", "reason", "chars"],
  file_attached: ["mime", "sizeBucket", "redactions"],
  setting_changed: ["key"],
  onboarding: ["step"],
  debug_mode_toggle: ["on"],
  analytics_consent: ["on"],
  update_check: ["channel", "result", "found_version"],
  update_downloaded: ["channel", "version"],
  update_install: ["channel", "version"],
  update_installed: ["channel", "from", "to"],
} as const satisfies Record<EventName, readonly string[]>;

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
