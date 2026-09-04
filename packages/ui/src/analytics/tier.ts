import type { EventName } from "./events";

/**
 * What a build that is packaged OUTSIDE the CI (`BUILD_ENV === "local"`: a `pnpm run eb`
 * on a workstation, a fork's own package) may report — and it is a LIST of what it may,
 * never of what it may not (rule 7).
 *
 * Why two tiers: such a build runs code that may differ from any release, so a
 * diagnostic event from it (a latency, a redaction fallback, a tool loop summary, an
 * `$exception`) describes code nobody else runs and would be read as a product fact.
 * Its USAGE, on the other hand, is real: which sections open, that a message was sent,
 * that a connector was connected. So the sink keeps the usage events and drops the
 * diagnostic ones — the `$exception` channel with them (`@openmasq/analytics` `tier`).
 *
 * `EVENT_TIER` is EXHAUSTIVE by type: adding an event to the vocabulary without filing
 * it here is a red typecheck, never a silent leak into the wrong tier.
 */
export type EventTier = "usage" | "diagnostic";

export const EVENT_TIER = {
  app_open: "usage",
  section_change: "usage",
  theme_toggle: "usage",
  language_change: "usage",
  new_chat: "usage",
  select_conversation: "usage",
  delete_conversation: "usage",
  send_message: "usage",
  stop: "usage",
  regenerate: "usage",
  copy_reply: "usage",
  avis_from_message: "usage",
  send_error: "diagnostic",
  change_model: "usage",
  default_model_set: "usage",
  redaction_applied: "usage",
  redaction_kept: "usage",
  redaction_forced: "usage",
  engine_used: "diagnostic",
  redaction_fallback_regex: "diagnostic",
  redaction_timing: "diagnostic",
  token_usage: "diagnostic",
  model_latency: "diagnostic",
  connector_connect: "usage",
  connector_disconnect: "usage",
  connector_error: "diagnostic",
  tool_called: "usage",
  tool_error: "diagnostic",
  tool_result: "diagnostic",
  tool_struggle: "diagnostic",
  tool_route_miss: "diagnostic",
  tool_route_salvage: "diagnostic",
  tool_route_rescue: "diagnostic",
  tool_schema_blind: "diagnostic",
  tool_loop_summary: "diagnostic",
  run_python_failed: "diagnostic",
  tool_gate_blocked: "diagnostic",
  file_attached: "usage",
  setting_changed: "usage",
  onboarding: "usage",
  debug_mode_toggle: "diagnostic",
  analytics_consent: "usage",
  update_check: "diagnostic",
  update_downloaded: "diagnostic",
  update_install: "diagnostic",
  update_installed: "diagnostic",
} as const satisfies Record<EventName, EventTier>;

/** The names a `usage`-tier sink lets through — derived, never a second list. */
export const USAGE_EVENTS: ReadonlySet<string> = new Set(
  (Object.keys(EVENT_TIER) as EventName[]).filter((n) => EVENT_TIER[n] === "usage"),
);
