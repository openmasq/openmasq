/**
 * The diagnostic FIELDS of a send failure, extracted from the error text — ONE home
 * (rule 9): ChatView used to carry them privately and the two LIVE emitters of
 * `send_error` (sendOrchestrator) never filled them (audit 13/08 — status,
 * gateway correlation id and retry count missing from every real failure).
 */

/** The HTTP status an error message carries (`(429)` etc.). */
export function httpStatus(e: unknown): number | undefined {
  const m = (e instanceof Error ? e.message : String(e)).match(/\((\d{3})\)/);
  return m ? Number(m[1]) : undefined;
}

/** The correlation id a failed call carries (`[req …]` appended by packages/llm, or the
 *  gateway's `request_id` echoed in the error body) — a server-minted opaque id, so it
 *  is safe metadata that joins this event to the gateway's `inference_upstream_error`
 *  holding the REAL upstream reason. */
export function requestIdOf(e: unknown): string | undefined {
  const t = e instanceof Error ? e.message : String(e);
  return /\[req ([\w-]+)\]/.exec(t)?.[1] ?? /"request_id"\s*:\s*"([\w-]+)"/.exec(t)?.[1];
}

/** How many attempts the provider client made (`— après N tentatives`) — distinguishes
 *  a fail-fast from an exhausted backoff in aggregate. */
export function retriesOf(e: unknown): number | undefined {
  const m = /après (\d+) tentatives/.exec(e instanceof Error ? e.message : String(e));
  return m ? Number(m[1]) : undefined;
}
