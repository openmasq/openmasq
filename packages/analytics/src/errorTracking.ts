import type { ErrorReport } from "./types";

/**
 * Strip anything that could carry PII from a free-form error message before it's
 * sent to error tracking: emails, `scheme://user:pass@`, bearer/long opaque tokens,
 * long digit runs, and obvious paths — then truncate. Conservative on purpose (an
 * error message is the one place raw user data can leak into telemetry).
 *
 * ⚠️ Order matters: each rule runs on what the previous one left. The two widest
 * (`‹token›`, `‹num›`) come after the shapes whose own content they would otherwise
 * eat — a Windows account name of 24+ characters, or the first chunk of a spaced IBAN.
 */
export function scrubMessage(raw: string): string {
  return (
    // Bounded BEFORE the rules: they run on the whole string, and some cost the square of a
    // long run; the result is cut far shorter below anyway.
    (raw ?? "").slice(0, 2000)
      .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "‹email›")
      .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s/]*:[^\s/@]*@/gi, "‹creds›@")
      // A Windows home directory: `C:\Users\julien\…`. The POSIX rule below only knows
      // FORWARD slashes, so on Windows — half the installs — every path in a message went
      // out whole, account name included (a real name, most of the time). Only the
      // `<drive>:\Users\<account>` head is a person; the rest of the path is not, and is
      // exactly the part that makes a report actionable.
      .replace(/[a-z]:\\Users\\[^\\\s]+/gi, "‹path›")
      // A number group written the way a person writes an IBAN, a card or an RIB: four or
      // more runs of 2-4 digits separated by spaces. The `\d{7,}` rule below sees only
      // unbroken runs, so the spaced form — the one someone actually types or pastes —
      // travelled in clear. Before that rule, or its first chunk would already be gone.
      .replace(/\b\d{2,4}(?: \d{2,4}){3,}\b/g, "‹num›")
      .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "‹token›")
      .replace(/\b\d{7,}\b/g, "‹num›")
      .replace(/(?:\/[\w .-]+){2,}/g, "‹path›")
      .slice(0, 200)
  );
}

/** An identifier as an engine prints it (`foo.bar`, `#x`, `Symbol(a)`): never prose. */
const ID = String.raw`[\w$.#<>\[\]]{1,60}`;
const ERRNO =
  "E(?:NOENT|ACCES|PERM|EXIST|ISDIR|NOTDIR|NOSPC|BUSY|MFILE|NFILE|PIPE|CONNRESET|CONNREFUSED|TIMEDOUT|ADDRINUSE|NOTFOUND|HOSTUNREACH|NETUNREACH|ROFS|IO|INVAL|XDEV|NOTEMPTY|AGAIN)";
const KIND = String.raw`^(?:Uncaught )?(?:[A-Z]\w{0,40}Error: )?`;

/**
 * The sentences an engine or the system writes with NO text of the person in them. Each is
 * matched at the START of the scrubbed message and ONLY the match leaves: an `ENOENT` keeps
 * its code and its call, not the file name behind it.
 */
const KNOWN_SENTENCES: RegExp[] = [
  `Cannot (?:read|set) propert(?:y|ies) of (?:undefined|null)(?: \\((?:reading|setting) '${ID}'\\))?`,
  `${ID} is not (?:a function|defined|iterable|a constructor)`,
  "Maximum call stack size exceeded",
  "Invalid (?:array|string) length",
  "Unexpected end of (?:JSON )?input",
  "(?:JavaScript heap )?out of memory",
  "Cannot find (?:module|package)",
  // A REAL system code, then the system's own lower-case words and the call: never a
  // capitalised word followed by prose (`ERREUR: le contrat de…` must not pass for one).
  `(?:${ERRNO})\\b(?:: [a-z ]{3,40}(?:, [a-z]{2,12})?)?`,
  `spawn [\\w.-]{1,40} (?:${ERRNO})\\b`,
  "SQLITE_[A-Z_]{2,40}",
  "net::ERR_[A-Z_]{2,60}",
  "MCP error -?\\d{1,6}",
  "(?:HTTP|status(?: code)?) \\d{3}\\b",
  "The operation was aborted|The user aborted a request",
  "(?:[Rr]equest|[Cc]onnection|[Oo]peration|[Ss]ocket) timed out",
  // The updater's OWN context line (versions, channel, HTTP status): the app wrote it.
  "running=[\\w.+-]{1,30}(?: target=[\\w.+-]{1,30})?(?: ch=[\\w-]{1,30})?(?: http=\\d{3})?",
].map((body) => new RegExp(`${KIND}(?:${body})`));

/** FNV-1a, 32 bits, as 8 hex digits. */
function fnv32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * WHAT OF A MESSAGE LEAVES THE MACHINE. A pattern scrubber cannot know that a word is a
 * name, and an error message is written by whoever threw it: a `JSON.parse` failure quotes
 * its input, a provider's refusal echoes the prompt. So the rule is an ALLOW list (rule 7):
 * the part matching a known sentence leaves; anything else leaves as a FINGERPRINT only,
 * `‹msg:xxxxxxxx›`, which still groups a failure and says nothing of its text. The
 * fingerprint is taken on the message's SHAPE (quoted runs and digits removed), so two
 * failures differing only by the value they quote are one. `scope`/`code`/`name` carry the
 * meaning; a failure worth reading in clear earns a code, not a longer message.
 * Pinned by `errorTracking.test.ts` (ui) and `sentry/policy.test.ts` (desktop).
 */
export function reduceMessage(raw: string): string {
  // Already reduced (the relay re-applies this rule to what a client sent): unchanged.
  if (/^‹msg:[0-9a-f]{8}›$/.test(raw ?? "")) return raw;
  const scrubbed = scrubMessage(raw);
  if (!scrubbed) return "";
  for (const re of KNOWN_SENTENCES) {
    const m = re.exec(scrubbed);
    if (m) return m[0];
  }
  const shape = (raw ?? "")
    .slice(0, 2000)
    .replace(/"[^"]*"|'[^']*'|`[^`]*`|«[^»]*»/g, "")
    .replace(/\d+/g, "")
    .toLowerCase();
  return `‹msg:${fnv32(shape)}›`;
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
// "la requête a expiré": Electron localizes its network errors in the OS's
// language, so the timeout of an update check or an MCP POST arrives in FRENCH on
// French-language machines — invisible to English patterns (measured: 66 reports of a
// timeout from the update feed, pure network). "request timed out" is its English twin and the
// text of MCP -32001 (a slow remote server, not a code bug).
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
