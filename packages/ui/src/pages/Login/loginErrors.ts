import type { Messages } from "@openmasq/i18n";

export type LoginStep = "email" | "sent" | "code";
export type LoginMethod = "link" | "code" | "google";
export type LoginFailure = "rate_limit" | "network" | "signups_closed" | "other";
export type LoginOutcome = "ok" | LoginFailure;

const messageOf = (e: unknown): string =>
  typeof e === "string" ? e.trim() : e instanceof Error ? e.message.trim() : "";

/** The failures we know how to name: ONE reading for the screen and for the count. */
export function loginFailure(e: unknown): LoginFailure {
  const s = messageOf(e);
  if (/rate limit|too many|429/i.test(s)) return "rate_limit";
  if (/failed to fetch|network|fetch failed/i.test(s)) return "network";
  // GoTrue's two phrasings: the instance-wide lock and the email provider's own.
  if (/signups? (?:not allowed|are disabled|is disabled)|disabled? signups?/i.test(s)) return "signups_closed";
  return "other";
}

/**
 * What the sign-in screen SHOWS of an authentication failure.
 *
 * Supabase answers in English and in server jargon; this function translates the cases
 * we know how to name and **lets the rest through as is**. The fallback is not
 * laziness: swallowing an unknown message would give a form that « ne fait rien », and
 * the product's rule is that a real failure says so. An English message is a lesser evil
 * than silence — but every case we learn to name must come down here.
 *
 * ⚠️ **« Signups not allowed » is not a failure, it is a SETTING**: production Supabase
 * has sign-ups closed (accounts are opened by hand), so any address that has not been
 * provisioned is refused when the link is sent. The raw message said « Signups not
 * allowed for this instance » in English on a French screen, without ever letting one
 * guess that the problem is the address itself (seen on PostHog on 14/08).
 */
export function friendlyError(e: unknown, t: Messages): string {
  const c = t.runtime.misc.login;
  const s = messageOf(e);
  if (!s || s === "[object Object]" || /^\{.*\}$/.test(s) || /^\[.*\]$/.test(s)) {
    return c.generic;
  }
  const failure = loginFailure(s);
  if (failure === "rate_limit") return c.rateLimit;
  if (failure === "network") return c.network;
  if (failure === "signups_closed") return c.signupsClosed;
  return s;
}
