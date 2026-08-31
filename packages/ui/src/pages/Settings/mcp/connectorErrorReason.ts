import type { TrackEvent } from "../../../analytics";

/**
 * BOUNDED cause of a connector's connection failure — the `ConnectorErrorReason` enum
 * had existed from the start and 17 call sites all hardcoded `"unknown"` (audit 13/08):
 * the event said « a connector failed » and nothing else. Derived from the error
 * message (never sent itself — enum only).
 */
export function connectorErrorReason(
  e: unknown,
): Extract<TrackEvent, { name: "connector_error" }>["reason"] {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (/oauth|consent|redirect|authorization code|pkce/.test(m)) return "oauth";
  if (/401|403|unauthorized|forbidden|invalid[_ ]?api[_ ]?key|api key|token/.test(m)) return "unauthorized";
  if (/fetch failed|network|econnrefused|enotfound|etimedout|timeout|err_network|err_internet|socket/.test(m)) return "network";
  return "unknown";
}
