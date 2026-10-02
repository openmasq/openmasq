/**
 * Client-side timeout for a single redaction call, sized to the input length.
 *
 * A short chat message stays snappy while a large document (a multi-page PDF's
 * extracted text) gets room to finish. This matters because the remote engine
 * runs its detector with its OWN budget of about 30 s: a client that aborts sooner gives up before the
 * server even replies — which is exactly what produced "timed out after 12s" on
 * a big PDF, turning a would-be (possibly regex-degraded) SUCCESS into a hard
 * failure. So the ceiling here sits ABOVE the server budget (server time + cold
 * start + network), while a genuinely hung endpoint still fails in bounded time.
 */
export const REDACT_TIMEOUT_MIN_MS = 15_000;
// A WHOLE document is detected now (`MAX_FILE_CHARS`): ~300k characters take ~40 s with the
// local model and grow linearly. The ceiling bounds a hung engine, not a big document — at
// 45 s it blocked the send of every long attachment, fail-closed but for nothing.
export const REDACT_TIMEOUT_MAX_MS = 15 * 60_000;

/** Timeout (ms) for redacting `text`: a floor + ~1 s per 1 000 chars, capped. */
export function redactTimeoutMs(text: string): number {
  const scaled = REDACT_TIMEOUT_MIN_MS + Math.ceil((text?.length ?? 0) / 1000) * 1000;
  return Math.min(REDACT_TIMEOUT_MAX_MS, Math.max(REDACT_TIMEOUT_MIN_MS, scaled));
}

/** Human "timed out after Ns" message for a given timeout, for warnings/logs. */
export function redactTimeoutMessage(ms: number): string {
  return `timed out after ${Math.round(ms / 1000)}s`;
}
