import type { SendErrorReason } from "../../analytics/events";

/**
 * What a failed agentic turn reports to the `$exception` channel, from the SAME bounded
 * reason `send_error` carries (`sendErrorReason`) — one classification, never two that
 * disagree (an OpenAI `insufficient_quota` wears a 429: it was reported as « rate-limit »
 * while `send_error` rightly said `provider_credits`).
 *
 * `null` = not an exception at all. An empty provider account, a missing key or a refused
 * key/session is the USER's account state, not a fault of the app: the bubble tells them
 * what to do, `send_error` counts it, and error tracking stays for what we must fix.
 * The code is the only readable part of an `$exception` (the relay fingerprints the
 * message), so it is as specific as the reason: `unknown` keeps the historic `tool-loop`.
 */
const ACCOUNT_STATES: ReadonlySet<SendErrorReason> = new Set(["provider_credits", "missing_key", "auth"]);

export function turnExceptionCode(reason: SendErrorReason): string | null {
  if (ACCOUNT_STATES.has(reason)) return null;
  return reason === "unknown" ? "tool-loop" : reason.replace(/_/g, "-");
}
