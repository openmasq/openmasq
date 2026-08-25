import type { ErrorReport } from "./types";

/**
 * Strip anything that could carry PII from a free-form error message before it's
 * sent to error tracking: emails, `scheme://user:pass@`, bearer/long opaque tokens,
 * long digit runs, and obvious paths — then truncate. Conservative on purpose (an
 * error message is the one place raw user data can leak into telemetry).
 */
export function scrubMessage(raw: string): string {
  return (raw ?? "")
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "‹email›")
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s/]*:[^\s/@]*@/gi, "‹creds›@")
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "‹token›")
    .replace(/\b\d{7,}\b/g, "‹num›")
    .replace(/(?:\/[\w .-]+){2,}/g, "‹path›")
    .slice(0, 200);
}

// Error-class names that are always TRANSIENT/OPERATIONAL, not code bugs: a flaky
// network or an expired/rate-limited auth token refresh. Reporting these floods the
// $exception channel with non-actionable noise (offline users retrying).
const OPERATIONAL_NAMES = new Set([
  "AuthRetryableFetchError",
  "InvalidGrantError",
  "TooManyRequestsError",
]);
// …and message shapes for the same: a failed fetch, a DNS/refused/timeout, a
// throttled or expired token refresh.
//
// ⚠️ **MCP transport-lifecycle errors ("Not connected" / "MCP error …: Connection
// closed") are dropped here too.** They were once KEPT-but-capped to catch a
// "packaging regression", but the evidence proved them pure operational noise: a
// remote connector's SSE drops (backend down / network), the SDK throws these on the
// next `listTools`/reconnect, and `registry.ts refreshRoutes` reports every one. They
// were ~87% of ALL $exception volume (2.5k "Not connected" + 1.5k "Connection closed"
// from ~2 users) and DROWNED the real bugs — while the per-SESSION flood cap is defeated
// by dev hot-reloads. The actual condition is ALREADY surfaced without this channel: the
// dead connector is torn down (`handleConnectorClosed`) and the user gets a "reconnexion
// nécessaire" banner. A genuine packaging regression manifests DIFFERENTLY (a spawn
// ENOENT / "cannot find module" / stdio failure), so this message-specific drop keeps
// that signal. A FATAL (uncaught) instance is still never dropped (below).
// « la requête a expiré » : Electron localise ses erreurs réseau dans la langue de l'OS,
// donc le timeout d'un check de mise à jour ou d'un POST MCP arrive en FRANÇAIS sur les
// postes francophones — invisible aux motifs anglais (mesuré : 66 rapports d'un timeout
// du feed de mise à jour, pur réseau). « request timed out » est son jumeau anglais et le
// texte du MCP -32001 (un serveur distant lent, pas un bug de code).
const OPERATIONAL_MSG =
  /failed to fetch|fetch failed|networkerror|load failed|net::err|econnrefused|enotfound|etimedout|only request this after|too many refresh_token|invalid refresh token|failed to reach hook|token has expired|not connected|connection closed|request timed out|la requête a expiré/i;

// An HTTP auth REJECTION (401 Unauthorized / 403 Forbidden) is an expected signed-out /
// expired-token / not-a-member condition, NOT a code bug — sync polling while logged
// out produced 200+ such $exceptions across 37 users. Matched two ways so it holds
// whichever a caller supplies: a structured `status` (preferred), or the `→ 401` /
// `→ 403` form the sync HTTP layer throws in its message (checked pre-scrub, so the
// arrow survives). Deliberately NOT a bare "401" anywhere in the text — the arrow keeps
// it to a genuine status verdict and off latency/id digits.
const AUTH_REJECT_STATUS = new Set([401, 403]);
const AUTH_REJECT_MSG = /→\s*40[13]\b/;

/** A transient/expected failure (offline, token refresh, an auth 401/403) — not a bug.
 *  Never drop a FATAL (uncaught) error, though: an uncaught "Failed to fetch" is a real
 *  crash. */
export function isOperationalError(e: ErrorReport): boolean {
  if (e.fatal) return false;
  if (typeof e.status === "number" && AUTH_REJECT_STATUS.has(e.status)) return true;
  if (e.name && OPERATIONAL_NAMES.has(e.name)) return true;
  const hay = `${e.name ?? ""} ${e.message ?? ""}`;
  return OPERATIONAL_MSG.test(hay) || AUTH_REJECT_MSG.test(hay);
}

// Per-session FLOOD guard: cap how many times the SAME error signature is reported,
// so a retry/reconnect loop (a crashed MCP server, an offline poll) can't post the
// same $exception hundreds of times (667× "Not connected" was observed). Resets on
// reload (a fresh module instance = a fresh app run).
export const REPORTED_ERRORS = new Map<string, number>();
export const MAX_PER_SIGNATURE = 5;
