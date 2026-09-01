import type { Messages } from "@openmasq/i18n";
/**
 * What the USER reads when a connector has failed — the readable counterpart to
 * `connectorErrorReason` (which itself only renders an enum for measurement).
 *
 * Before, the provider's RAW message displayed as-is, in two places: in the
 * modal, and in the grid where it REPLACES the description (the Vercel card stopped saying
 * what Vercel is to show "Refresh token is invalid."). Technical English,
 * with nothing telling you what to do, on the one screen where the fix takes one click.
 *
 * Rule: we DISGUISE nothing — a failure stays announced — but we say it in the
 * user's language and we name the action. The raw text isn't lost: it stays in the
 * debug journal, where it serves whoever is diagnosing.
 *
 * ⚠️ An UNKNOWN family returns `null`: the caller then shows the original message.
 * Making up a reassuring sentence about a failure we don't understand would be worse than
 * raw English — that's the "a real failure gets said" rule.
 */

/** Dead authorization: the one case the user fixes themselves, in one click. */
const EXPIRED_RE =
  /invalid[_ ]grant|refresh token|expired or revoked|token (?:has )?(?:is )?(?:been )?(?:expired|revoked|invalid)|\b401\b|unauthorized|authorization (?:required|failed)|invalid[_ ]client/i;
/** The service is reachable but refuses us: nothing to re-click, it's on the service's side. */
const FORBIDDEN_RE = /\b403\b|forbidden|access denied|insufficient (?:scope|permission)/i;
/** Network: it'll work again on its own. */
const NETWORK_RE =
  /fetch failed|network|econnrefused|econnreset|enotfound|etimedout|timeout|socket|dns|\b5\d\d\b|bad gateway|service unavailable/i;
/** The server can't do the flow — neither the user nor a retry can do anything about it. */
const UNSUPPORTED_RE = /dynamic client registration|unknown server|no url|url refusée/i;
/** API key refused: the action is to replace it, not to reconnect. */
const APIKEY_RE = /clé api refusée|invalid[_ ]?api[_ ]?key|api key/i;

export interface ConnectorErrorText {
  /** The sentence shown in place of the raw message. */
  text: string;
  /** `true` when reconnecting IS the action — the UI then emphasizes it. */
  reconnect: boolean;
}

/** Renders the user-facing text, or `null` if unknown (⇒ keep the raw one). */
export function connectorErrorText(
  raw: string | undefined | null,
  t: Messages,
): ConnectorErrorText | null {
  const m = (raw ?? "").trim();
  if (!m) return null;
  // The ORDER carries the rule: a refused key and a 403 look like an expiration, but
  // the action differs — so we test from most specific to most general.
  if (APIKEY_RE.test(m)) return { text: t.mcpTab.errors.apikey, reconnect: false };
  if (UNSUPPORTED_RE.test(m)) return { text: t.mcpTab.errors.unsupported, reconnect: false };
  if (FORBIDDEN_RE.test(m)) return { text: t.mcpTab.errors.forbidden, reconnect: true };
  if (EXPIRED_RE.test(m)) return { text: t.mcpTab.errors.expired, reconnect: true };
  if (NETWORK_RE.test(m)) return { text: t.mcpTab.errors.network, reconnect: false };
  return null;
}
