import type { TrackEvent } from "./events";
import { sanitize } from "./sanitize";
import { sink } from "./posthog";

export type {
  TrackEvent,
  SendErrorReason,
  ToolErrorReason,
  ToolErrorFamily,
} from "./events";
export { bucket } from "./sanitize";
export { configureAnalytics, setAnalyticsConsent, setAnalyticsSuspended, setStableIdSource, analyticsDistinctId, captureError } from "./posthog";
export type { ErrorReport } from "@openmasq/analytics";
export { USAGE_EVENTS } from "./tier";

/**
 * Capture a typed event: allow-list + bucket it, then hand it to the sink (which
 * only sends when configured + opted-in). The single choke point — every event
 * passes through `sanitize`, so no raw payload can reach a network call.
 */
export function captureEvent(event: TrackEvent): void {
  sink(sanitize(event));
}
