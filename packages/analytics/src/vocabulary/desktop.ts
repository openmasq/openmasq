/**
 * The DESKTOP event vocabulary — every event the app may emit, with EXACTLY the keys each
 * may carry. Data only (`as const`): the TYPE it must agree with (`TrackEvent`, the
 * discriminated union) lives with the app in `@openmasq/ui/src/analytics/events.ts`, and
 * `sanitize.parity.test.ts` there pins both directions at the type level.
 *
 * It lives HERE, not beside that union, because it has TWO readers: the app's allow-list
 * walk (drops any key a call site attaches that is not declared) and the relay
 * (`apps/analytics-fn`, private `infra` repo), which admits an envelope only if its event
 * and keys are in this list. One list, imported by both — a copy would let the relay drop
 * what the app declares, silently, on the next event added.
 */
export const DESKTOP_EVENTS = {
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
} as const;
