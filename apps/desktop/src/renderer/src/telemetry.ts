import {
  configureAnalytics,
  configurePlatformAccess,
  captureError,
  captureEvent,
  setAnalyticsSuspended,
  setStableIdSource,
  USAGE_EVENTS,
  type TrackEvent,
} from "@openmasq/ui";
import { initSentryRenderer } from "../../sentry/renderer";
import { AUTH_CONFIGURED, authHost } from "./auth";
import { SYNC_ENABLED } from "./sync";
import {
  ANALYTICS_DEBUG,
  ANALYTICS_RELAY_URL,
  APP_VERSION,
  BILLING_SOLD,
  BUILD_ENV,
  GATEWAY_CONFIGURED,
  RUNTIME_ENV,
} from "./appEnv";

/**
 * Everything the renderer wires up BEFORE it renders: crash reporting, the platform-access
 * verdict, the analytics sink and the channels that feed it. One file, so what leaves this
 * process, under which gate, is readable in one place (rule 10). ⚠️ ORDER IS THE CONTRACT:
 * the FIRST statement of `main.tsx`, because a bootstrap error is the one you can't reproduce.
 */
export function initRendererTelemetry(): void {
  initSentryRenderer();

  // Analytics go through the FIRST-PARTY RELAY ONLY: the app NEVER holds an analytics key
  // (no `key`/`apiHost` here, so none is ever inlined). Sending stays behind consent.
  // SERVED = gateway + accounts; SOLD = `OPENMASQ_BILLING=1`. An entered stack serves
  // without selling.
  configurePlatformAccess({
    served: GATEWAY_CONFIGURED && AUTH_CONFIGURED,
    sold: BILLING_SOLD && SYNC_ENABLED,
  });

  configureAnalytics({
    relayUrl: ANALYTICS_RELAY_URL,
    source: "desktop",
    // The session, when there is one, lets the relay stamp `verified`: LAZY, never an
    // identity (`@openmasq/analytics` types.ts).
    getAuthToken: () => authHost.getAccessToken?.() ?? Promise.resolve(null),
    // ⚠️ `runtimeEnv` is the SECOND axis, reserved for FLAGS: a prod binary switched to
    // staging stays `BUILD_ENV: "production"` (`@openmasq/analytics` types.ts).
    env: BUILD_ENV,
    runtimeEnv: RUNTIME_ENV,
    appVersion: APP_VERSION,
    tier: BUILD_ENV === "local" ? "usage" : "full",
    usageEvents: USAGE_EVENTS, // a package built outside CI reports usage only
    debug: ANALYTICS_DEBUG,
  });

  // The STABLE ID: the per-machine `installId`, which survives a wiped profile. DECLARED
  // as a source the sink AWAITS, so no event leaves before the question is settled
  // (`@openmasq/ui` `analytics/posthog.ts`).
  setStableIdSource(async () => (await window.openmasq.updates?.current?.())?.installId);

  // NON-HUMAN launches: the truth comes from MAIN (`OPENMASQ_E2E`), never the renderer.
  // Not a race: nothing leaves before consent is settled.
  void window.openmasq.env
    ?.isE2e?.()
    .then((on) => {
      if (on) setAnalyticsSuspended(true);
    })
    .catch(() => {});

  // Uncaught renderer errors → the SEPARATE `$exception` channel, scrubbed by `captureError`.
  window.addEventListener("error", (ev) => {
    captureError({
      scope: "uncaught",
      code: "window-error",
      name: (ev.error as Error | undefined)?.name,
      message: (ev.error as Error | undefined)?.message || ev.message,
      fatal: true,
    });
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const r = ev.reason as { name?: string; message?: string } | undefined;
    captureError({
      scope: "uncaught",
      code: "unhandled-rejection",
      name: r?.name,
      message: r?.message || String(ev.reason),
      fatal: true,
    });
  });
  window.openmasq.onAppError?.((e) => captureError(e));
  // Main-process product events through the SAME consent-gated choke point; main emits
  // against the `TrackEvent` catalogue, the cast re-narrows what IPC widened.
  window.openmasq.onAppEvent?.((e) => captureEvent(e as TrackEvent));
}
