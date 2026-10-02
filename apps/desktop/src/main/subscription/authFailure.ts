/**
 * Is this CLI failure an EXPIRED or MISSING session — the one failure a retry cannot fix
 * and a sign-in can? The ONE home of those patterns; `authFailure.test.ts` is their table
 * (real-shaped messages, positive AND negative, per CLI).
 *
 * Kept NARROW on purpose: a quota, a rate limit, a model the plan does not include, a
 * refusal or a network blip keep their own path (`rate_limit_event`, the 429 humaniser).
 * A false positive here would tell someone with a working session to sign in again; a
 * false negative only leaves today's message in place. So every pattern names the
 * session, never a bare status code.
 *
 * Sources (what each CLI prints, as observed or as its own code words it):
 * - claude: the `result` event's text — « Invalid API key · Please run /login »,
 *   « Not logged in · Please run /login », « OAuth token has expired… », « OAuth token
 *   revoked · Please run /login », « Failed to authenticate. API Error: 401
 *   {…"authentication_error"…} » — and the `assistant` event's `error:
 *   "authentication_failed"` field (`claudeStream.ts` flags that one structurally).
 * - codex: `turn.failed` / stderr — « unexpected status 401 Unauthorized », « Your access
 *   token could not be refreshed because your refresh token has expired. Please log out
 *   and sign in again. », « Not logged in », its `token_expired` / `refresh_token_*` codes.
 * - antigravity: « You are not logged into Antigravity. » (`agy models`, `account.test.ts`),
 *   and Google's own words for an unauthenticated call (`UNAUTHENTICATED`, « invalid
 *   authentication credentials »).
 */
import type { SubscriptionCliId } from "./resolveCli";

/** Every CLI: the session is named, not just a status code. */
const COMMON: readonly RegExp[] = [
  /\bnot logged in(to)?\b/i,
  /\b(log|sign) ?in again\b/i,
  /\blogin required\b/i,
  /\b401\b[^\n]{0,24}\bunauthori[sz]ed\b/i,
];

const PER_CLI: Readonly<Record<SubscriptionCliId, readonly RegExp[]>> = {
  claude: [
    /please run \/login/i,
    /\boauth token (has )?(expired|been revoked|revoked)\b/i,
    /\binvalid api key\b/i,
    /\bauthentication_error\b/,
    /\bauthentication_failed\b/,
    /\bfailed to authenticate\b/i,
  ],
  codex: [
    /access token could not be refreshed/i,
    /\brefresh[_ ]token[_ ](has )?(expired|reused|was already used|invalidated|revoked)\b/i,
    /\btoken_(expired|invalidated)\b/,
    /\brun `?codex login`?/i,
  ],
  antigravity: [
    /\bUNAUTHENTICATED\b/,
    /\binvalid authentication credentials\b/i,
    /\bplease (sign|log) ?in\b/i,
  ],
};

const matches = (cli: SubscriptionCliId, line: string): boolean =>
  COMMON.some((re) => re.test(line)) || PER_CLI[cli].some((re) => re.test(line));

/**
 * Pure: the LINE of this text (an error message, a stderr tail) that says the CLI's
 * session is gone, or `null`. Only that line travels on as the debug detail: a stderr
 * tail can carry anything else the CLI logged, and none of it is needed.
 */
export function cliAuthFailureLine(cli: SubscriptionCliId, text: string): string | null {
  if (!text) return null;
  for (const line of text.split(/\r?\n/)) {
    if (matches(cli, line)) return line.trim();
  }
  return null;
}
