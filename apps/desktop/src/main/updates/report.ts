import { app } from "electron";
import { getConfig } from "./config";

/** Optional main-process error reporter (injected → `reportMainError`). */
type ReportError = (code: string, err: unknown) => void;

/**
 * Report an update FAILURE to the `$exception` telemetry channel (via the injected
 * reporter → PostHog). Concise but very informative: a SPECIFIC `updater-<code>` (so
 * PostHog groups download-404 / signature / no_space / network / app_running apart) plus
 * a one-line message that carries the CONTEXT support actually needs — the channel, the
 * running + attempted version, and any HTTP status — AHEAD of the scrubbed raw reason.
 *
 * Secret/PII-free by construction: the updater only ever sees versions, channel names,
 * feed URLs and status codes (the renderer's `captureError` scrubs the message anyway).
 */
export function reportUpdateFailure(
  report: ReportError,
  code: string,
  err: unknown,
  ctx?: { version?: string },
): void {
  const detail = (err instanceof Error ? err.message : String(err ?? "")).trim();
  // electron-updater throws builder-util-runtime's `HttpError`, which carries
  // `statusCode` — reading only `status` meant the feed's HTTP status NEVER reached
  // telemetry (a dead feed and a rejected device looked identical).
  const raw = err as { status?: number; statusCode?: number } | null;
  const status = typeof raw?.statusCode === "number" ? raw.statusCode : raw?.status;
  const context = [
    `running=${app.getVersion()}`,
    ctx?.version ? `target=${ctx.version}` : "",
    `ch=${getConfig().channel}`,
    typeof status === "number" ? `http=${status}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  // Context FIRST: `captureError` scrubs the message then truncates it at 200 chars, and
  // electron-updater's own text alone is longer than that — appended context was always
  // cut off before it left the machine (the running/target version never arrived).
  const e = new Error(detail ? `${context} · ${detail}` : context);
  // The status rides in the `updater-download-<status>` code and in `context`, and is
  // deliberately NOT set as `e.status`: `isOperationalError` DROPS any report carrying a
  // 401/403 (an expected signed-out condition for the sync layer), which would silently
  // swallow exactly the case where the update feed rejects this device.
  report(`updater-${code}`, e);
}
