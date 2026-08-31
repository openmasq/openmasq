import type { McpServerInfo } from "./types";

/*
 * Targeted retry of a remote connector's (HTTP/OAuth) SILENT reconnect.
 *
 * Why: at startup (and on every account switch), `mcpReconnectStored`
 * reconnects ALL connectors in parallel, best-effort, in ONE attempt
 * each. An HTTP connector then does an OAuth refresh + a JSON-RPC handshake;
 * under load (several instances, or simply a slow network), some
 * fail on a transient timeout — and stay absent until the
 * user reconnects them by hand. The e2e bench measured it: notion/airtable
 * (remote) not reconnected where gmail/calendar (on-device OAuth) held.
 *
 * The subtlety: do NOT retry a PERMANENT failure (expired authorization, server
 * with no OAuth registration, refused key) — retrying would change nothing and would lengthen
 * startup. Only the transient (network/timeout/handshake) is retried.
 */

// A failure retrying which would change nothing: the user must re-authorize, or the
// server doesn't support the flow — surface it right away, don't loop.
//
// ⚠️ The list must speak the PROVIDERS' language, not ours. It used to carry only
// our own phrasings (« authorization required/failed »), so much so that ALL the
// ways a server announces a dead authorization passed for transient:
// `invalid_grant` (the standard OAuth2 code), « Refresh token is invalid. » (Vercel),
// « Token has been expired or revoked. » (Google), a bare 401/403. Every expired
// connector therefore paid for 3 doomed attempts + the backoff, on EVERY startup and
// every account switch — exactly what this filter exists to avoid (15/08).
// A dead token doesn't come back to life by retrying: only the user can re-authorize.
const PERMANENT_RE =
  /authorization required|authorization failed|dynamic client registration|clé api refusée|url refusée|unknown server|no url|invalid[_ ]grant|refresh token|expired or revoked|token (?:has )?(?:is )?(?:been )?(?:expired|revoked|invalid)|\b401\b|\b403\b|unauthorized|forbidden|invalid[_ ]client/i;

/** `true` = transient failure, a retry has a chance; `false` = permanent (or no
 *  error at all). With no message, the failure is treated as non-retryable. */
export function isTransientConnectError(error: string | undefined): boolean {
  return !!error && !PERMANENT_RE.test(error);
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Attempts the reconnect, and retries on a TRANSIENT failure with an exponential
 * backoff. Stops as soon as `isConnected()` is true, or on a permanent failure,
 * or after `tries` attempts. Best-effort: never throws (the caller is already
 * inside an `allSettled`).
 */
export async function reconnectRemoteWithRetry(
  connectOnce: () => Promise<McpServerInfo>,
  isConnected: () => boolean,
  opts: { tries?: number; baseDelayMs?: number } = {},
): Promise<McpServerInfo | undefined> {
  const tries = opts.tries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 600;
  let last: McpServerInfo | undefined;
  for (let i = 0; i < tries; i++) {
    try {
      last = await connectOnce();
    } catch {
      // connectServer almost never throws (it RETURNS the error), but an unexpected
      // throw is treated as transient: retried as long as attempts remain.
      if (i < tries - 1) await delay(baseDelayMs * 2 ** i);
      continue;
    }
    if (isConnected()) return last;
    if (!isTransientConnectError(last.error)) return last; // permanent → no point insisting
    if (i < tries - 1) await delay(baseDelayMs * 2 ** i);
  }
  // The LAST verdict is returned to the caller: it's the caller who decides whether the failure
  // deserves to be SHOWN (a dead authorization at startup used to be visible nowhere).
  return last;
}

/**
 * Should this SILENT reconnect failure light up the "reconnection
 * needed" banner?
 *
 * A connect's error is only the RETURN value of the call: `infoFor` doesn't carry it,
 * so neither does `mcp:list`. A connector whose token had expired therefore simply came
 * back ABSENT at startup — no banner, nothing on its card — and the user
 * only found out by clicking "Connect" on their own (15/08 log, Vercel).
 *
 * ⚠️ Only on a PERMANENT failure. Offline at launch would otherwise announce everything as "needs
 * reconnecting" when only the network is missing — and that fixes itself.
 */
export function shouldFlagForReconnect(
  last: McpServerInfo | undefined,
  isConnected: boolean,
): boolean {
  return !isConnected && !!last?.error && !isTransientConnectError(last.error);
}
