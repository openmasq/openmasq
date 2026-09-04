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
 * Everything the renderer wires up BEFORE it renders, and nothing else: crash reporting,
 * the platform-access verdict, the analytics sink and the four channels that feed it.
 *
 * It lives beside `main.tsx` rather than inside it because it is one subject, and rule 10
 * asks that a trust surface be readable in one place: what leaves this process, under
 * which gate, is now a single file. `main.tsx` keeps the Host and the render.
 *
 * ⚠️ ORDER IS THE CONTRACT. `initRendererTelemetry()` is the FIRST statement of
 * `main.tsx` for the reason its first line gives: an error during bootstrap is the one
 * you cannot reproduce.
 */
export function initRendererTelemetry(): void {
  // Before everything else: an error during renderer bootstrap is precisely
  // the one you can't reproduce.
  initSentryRenderer();

  // Wire opt-in usage analytics + error tracking through the FIRST-PARTY RELAY ONLY.
  // The desktop NEVER holds a PostHog key: it POSTs the neutral envelope to the relay
  // (apps/analytics-fn), which forwards to PostHog with its OWN server-side key. We
  // deliberately do NOT pass `key`/`apiHost` here so `VITE_POSTHOG_KEY` is never
  // referenced → never inlined in the shipped bundle, regardless of the build env.
  // The URLs and their defaults live in `./appEnv`. Sending stays subject to in-app
  // consent (+ Do-Not-Track): nothing here touches the privacy gate.
  // SERVED = gateway + accounts; SOLD = `OPENMASQ_BILLING=1` (the gate for remote
  // addresses at build time — `appEnv.ts` BILLING_SOLD). An entered stack serves without selling.
  configurePlatformAccess({
    served: GATEWAY_CONFIGURED && AUTH_CONFIGURED,
    sold: BILLING_SOLD && SYNC_ENABLED,
  });

  configureAnalytics({
    relayUrl: ANALYTICS_RELAY_URL,
    source: "desktop",
    // La session Supabase authentifie la requête vers le relais — PARESSEUSE, et ce qu'elle
    // coûte hors session : `@openmasq/analytics` types.ts, `getAuthToken`.
    getAuthToken: () => authHost.getAccessToken?.() ?? Promise.resolve(null),
    // Stamps env + version on every event (`./appEnv` explains the derivation, and why
    // "empty" does NOT mean production). ⚠️ `runtimeEnv` is the SECOND axis, stamped nowhere
    // else: reserved for FLAGS, because a prod binary switched to staging stays
    // `BUILD_ENV: "production"` (`@openmasq/analytics` types.ts).
    env: BUILD_ENV,
    runtimeEnv: RUNTIME_ENV,
    appVersion: APP_VERSION,
    tier: BUILD_ENV === "local" ? "usage" : "full",
    usageEvents: USAGE_EVENTS, // a package built outside CI reports usage only (`@openmasq/ui` analytics/tier.ts)
    // Logs every event (sent / skipped + reason) in dev; VITE_POSTHOG_DEBUG=1 also opens it on a package.
    debug: ANALYTICS_DEBUG,
  });

  // The STABLE ID: the `installId` from `updates.json`, a per-machine uuid that survives a
  // wiped profile — without which a fresh localStorage recreates a "person" every time
  // (measured: 277 out of 278 production identities had lived only one day).
  //
  // ⚠️ We DECLARE the source, we no longer push the value. The pushed version ran in
  // parallel with startup and bet that the sink's queue would last longer
  // than this IPC round trip; losing that bet — or `current()` failing — would carve in a
  // definitive `anon-…`, adoption never overwriting anything. Here the sink AWAITS `getAnonId()`,
  // so no event can leave before the question is settled. The detail of the
  // three cases is in `@openmasq/ui` `analytics/posthog.ts`.
  setStableIdSource(async () => (await window.openmasq.updates?.current?.())?.installId);

  // Safeguard against NON-HUMAN launches, the top source of noise in the
  // numbers: the truth comes from MAIN (`OPENMASQ_E2E` at launch), the renderer can't
  // claim it for itself — a spec driving the built app no longer emits anything. Not a
  // race: nothing leaves before consent is settled (the settings effect),
  // well after this IPC round trip.
  void window.openmasq.env
    ?.isE2e?.()
    .then((on) => {
      if (on) setAnalyticsSuspended(true);
    })
    .catch(() => {});

  // Error tracking: route ANY uncaught renderer error / unhandled rejection to the
  // SEPARATE `$exception` channel (not the product-events stream). Anonymised — the
  // message is scrubbed of PII by `captureError`, and it's gated by the same consent.
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
  // Main-process errors, forwarded over IPC → the same anonymised channel (the
  // message is scrubbed by `captureError` before it leaves the machine).
  window.openmasq.onAppError?.((e) => captureError(e));
  // Main-process product events (the auto-update funnel — main is the only process that
  // sees a check/download/install) through the SAME allow-listed, consent-gated choke
  // point as a renderer event. Main emits against the `TrackEvent` catalogue too, so the
  // cast just re-narrows what the IPC boundary widened.
  window.openmasq.onAppEvent?.((e) => captureEvent(e as TrackEvent));
}
