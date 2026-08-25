import type { TrackEvent } from "../../../analytics";

/**
 * Cause BORNÉE d'un échec de connexion d'un connecteur — l'enum `ConnectorErrorReason`
 * existait depuis le début et 17 sites d'appel codaient tous `"unknown"` (audit 13/08) :
 * l'événement disait « un connecteur a échoué » et rien d'autre. Dérivée du message
 * d'erreur (jamais transmis lui-même — enum seule).
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
