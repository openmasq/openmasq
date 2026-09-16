import type { McpServerInfo } from "./types";

/*
 * Targeted retry of a remote connector's SILENT reconnect: under load a transient
 * timeout would leave it absent until the user reconnects by hand. A PERMANENT failure
 * (expired authorization, no OAuth registration, refused key) is NOT retried.
 */

/**
 * The error reported when the SDK's token refresh never reached the server: the SDK
 * would fall through to a NEW authorization, a PERMANENT verdict for a valid token.
 * Worded so `PERMANENT_RE` cannot match it (`reconnectRetry.test.ts`).
 */
export const REFRESH_NETWORK_ERROR = "network failure while renewing the session";

// ⚠️ Speaks the PROVIDERS' language, not only ours: `invalid_grant`, « expired or
// revoked », a bare 401/403 all announce a dead authorization, which no retry revives.
const PERMANENT_RE =
  /authorization required|authorization failed|dynamic client registration|clé api refusée|url refusée|unknown server|no url|invalid[_ ]grant|refresh token|expired or revoked|token (?:has )?(?:is )?(?:been )?(?:expired|revoked|invalid)|\b401\b|\b403\b|unauthorized|forbidden|invalid[_ ]client/i;

/** `true` = transient failure, a retry has a chance; `false` = permanent (or no
 *  error at all). With no message, the failure is treated as non-retryable. */
export function isTransientConnectError(error: string | undefined): boolean {
  return !!error && !PERMANENT_RE.test(error);
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Retries on a TRANSIENT failure with exponential backoff; stops when connected, on a
 *  permanent failure, or after `tries`. Never throws. */
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
      // An unexpected throw is treated as transient.
      if (i < tries - 1) await delay(baseDelayMs * 2 ** i);
      continue;
    }
    if (isConnected()) return last;
    if (!isTransientConnectError(last.error)) return last; // permanent → no point insisting
    if (i < tries - 1) await delay(baseDelayMs * 2 ** i);
  }
  // The LAST verdict: the caller decides whether the failure deserves to be SHOWN.
  return last;
}

/**
 * Should this SILENT failure light up the banner? A connect's error is only the RETURN
 * value (`mcp:list` doesn't carry it), so without this a dead token was visible nowhere.
 * ⚠️ Only on a PERMANENT failure: offline at launch fixes itself.
 */
export function shouldFlagForReconnect(
  last: McpServerInfo | undefined,
  isConnected: boolean,
): boolean {
  return !isConnected && !!last?.error && !isTransientConnectError(last.error);
}
