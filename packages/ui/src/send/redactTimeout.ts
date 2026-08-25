/**
 * Client-side timeout for a single redaction call, sized to the input length.
 *
 * A short chat message stays snappy while a large document (a multi-page PDF's
 * extracted text) gets room to finish. This matters because the remote Scaleway
 * engine (`apps/gateway`) runs its GPT-OSS detector with its OWN budget of
 * ~30 s (`GPTOSS_TIMEOUT_MS`): a client that aborts sooner gives up before the
 * server even replies — which is exactly what produced "timed out after 12s" on
 * a big PDF, turning a would-be (possibly regex-degraded) SUCCESS into a hard
 * failure. So the ceiling here sits ABOVE the server budget (server time + cold
 * start + network), while a genuinely hung endpoint still fails in bounded time.
 */
export const REDACT_TIMEOUT_MIN_MS = 15_000;
export const REDACT_TIMEOUT_MAX_MS = 45_000;

/** Timeout (ms) for redacting `text`: a floor + ~1 s per 1 000 chars, capped. */
export function redactTimeoutMs(text: string): number {
  const scaled = REDACT_TIMEOUT_MIN_MS + Math.ceil((text?.length ?? 0) / 1000) * 1000;
  return Math.min(REDACT_TIMEOUT_MAX_MS, Math.max(REDACT_TIMEOUT_MIN_MS, scaled));
}

/** Human "timed out after Ns" message for a given timeout, for warnings/logs. */
export function redactTimeoutMessage(ms: number): string {
  return `timed out after ${Math.round(ms / 1000)}s`;
}
