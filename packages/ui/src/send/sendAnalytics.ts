import { redactionCategory, type RedactionMatch } from "@openmasq/redact";
import type { TrackEvent } from "../analytics/events";

export interface RedactedSpan {
  value: string;
  kind: string;
}

/**
 * The spans redacted in this message (pure). Records the FINE category (not the coarse
 * colour kind) so per-category toggles govern re-applying these values across later
 * turns; highlight tones still resolve from it. Feeds both the persisted
 * `message.redactedSpans`/`redactionKinds` AND the analytics below.
 */
export function deriveRedactedSpans(matches: RedactionMatch[]): RedactedSpan[] {
  return matches.map((m) => ({ value: m.value, kind: redactionCategory(m.category ?? m.type) }));
}

/**
 * Build the send's privacy-safe analytics events (pure). PRIVACY: counts / enums /
 * category KEYS only — NEVER a redacted value or any content (the sanitize allow-list
 * would strip anything else, but the shape is kept clean at the source). Redaction is
 * unconditional, so the redaction outcome is always reported alongside `send_message`.
 */
export function buildSendAnalyticsEvents(args: {
  /** The denominator of the failure rate PER MODEL (audit 13/08): `send_error` has
   *  always carried provider/model — without them here, no ratio is computable. */
  provider?: string;
  model?: string;
  textLength: number;
  matchCount: number;
  useAiDetect: boolean;
  useRemote: boolean;
  modelError: boolean;
  /** The fine categories of the redacted spans (deduped here for `redaction_applied`). */
  spanKinds: string[];
}): TrackEvent[] {
  const { provider, model, textLength, matchCount, useAiDetect, useRemote, modelError, spanKinds } = args;
  const events: TrackEvent[] = [
    { name: "send_message", chars: textLength, redactions: matchCount, provider, model },
    { name: "engine_used", engine: useAiDetect || useRemote ? "model" : "patterns" },
  ];
  if (matchCount) {
    events.push({ name: "redaction_applied", count: matchCount, kinds: Array.from(new Set(spanKinds)) });
  }
  // Model detector requested but failed → degraded to regex-only.
  if (useAiDetect && modelError) events.push({ name: "redaction_fallback_regex" });
  return events;
}

/** BOUNDED cause of a detection failure (never the raw message — it already goes to
 *  the log): the `reason` of `redaction_timing { ok:false }`. */
export function redactionFailReason(e: unknown): "timeout" | "unreachable" | "auth" | "error" {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (m.includes("timed out") || m.includes("timeout")) return "timeout";
  if (/401|403|unauthorized|invalid[_ ]?api[_ ]?key|api key/.test(m)) return "auth";
  if (/fetch failed|network|econnrefused|enotfound|err_network|err_internet/.test(m)) return "unreachable";
  return "error";
}
