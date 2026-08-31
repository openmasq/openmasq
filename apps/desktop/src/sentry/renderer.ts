import * as Sentry from "@sentry/electron/renderer";
import { resolveEnvironment, sentryBeforeSend } from "./policy";

/**
 * Sentry for the RENDERER — the interface, so the place where an error is most visible
 * to the user.
 *
 * ⚠️ **No DSN here, and that's not an oversight.** The renderer's CSP
 * (`renderer/index.html`) enumerates reachable hosts and Sentry is NOT among them: a
 * direct send would be blocked outright. The renderer SDK therefore goes over IPC to main, which holds
 * the DSN — that's `@sentry/electron`'s nominal mode, and it has the right side effect here:
 * a single egress point, the one already audited. The bridge is opened by
 * `@sentry/electron/preload`, imported in `preload/index.ts` (mandatory under
 * `contextIsolation`).
 *
 * ⚠️ `defaultIntegrations: false` for the same reason as on the main side, with a default
 * specific to the browser that would be especially bad here: `Breadcrumbs` records
 * DOM clicks **with the element's text** — so a conversation's title, a contact's
 * name, a message excerpt. And `contextLines` joins the source code.
 */
export function initSentryRenderer(): void {
  // The renderer-side counterpart of main's `app.isPackaged` guard: `import.meta.env.DEV` is
  // true under `electron-vite dev` and false in any BUILT bundle — it's the same
  // boundary, expressed with what this process can see. Same escape hatch, in `VITE_`
  // since `process.env` doesn't exist here.
  if (import.meta.env.DEV && import.meta.env.VITE_SENTRY_DEV !== "1") return;
  const channel = import.meta.env.VITE_UPDATES_CHANNEL || "";
  Sentry.init({
    environment: resolveEnvironment(channel),
    release: import.meta.env.VITE_APP_VERSION || undefined,
    defaultIntegrations: false,
    integrations: [
      // ⚠️ The `error`/`unhandledrejection` handlers are a DEFAULT integration
      // (`globalHandlers`) — so REMOVED by `defaultIntegrations: false`. An earlier
      // version of this file claimed "the SDK sets them up on its own": that was
      // wrong, and the renderer — the process the user looks at — sent NO
      // stack trace to Sentry as long as this line was missing (observability audit 13/08).
      Sentry.globalHandlersIntegration(),
      // Same event reported twice (React error boundary + window.onerror) → collapsed to one.
      Sentry.dedupeIntegration(),
      // Already-wrapped errors keep their root cause.
      Sentry.linkedErrorsIntegration(),
    ],
    beforeBreadcrumb: () => null,
    beforeSend: (event) => sentryBeforeSend(event as never) as never,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // No `initialScope`: the Electron SDK STRIPS it on the renderer side (verified dead code);
    // process attribution comes from the `event.process` tag set at the relay and allow-listed
    // by `policy.ts`.
  });
}
