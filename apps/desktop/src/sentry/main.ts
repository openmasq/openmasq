import { app } from "electron";
import * as Sentry from "@sentry/electron/main";
import { resolveEnvironment, sentryBeforeSend, SENTRY_DSN } from "./policy";

/**
 * Sentry for the MAIN process — and, in the same stroke, for BOTH helpers, since they
 * re-enter through `main/index.ts` (agent browser, @playwright/mcp). The `process`
 * tag says which one crashed; without it, three processes look alike in the
 * dashboard.
 *
 * ⚠️ `defaultIntegrations: false` — this is the structural decision of this file.
 * The SDK's default integrations are, here, a dumping ground for real data:
 *   · `SentryMinidump` uploads a NATIVE dump, that is, the process's MEMORY —
 *     the coffre, the keys, the plaintext prompts. The most dangerous of the lot, and it's
 *     enabled first by default;
 *   · `LocalVariables` attaches the VALUE of local variables to frames;
 *   · `ContextLines` joins the source code around the line;
 *   · `Screenshots` captures the window — so the conversation on screen;
 *   · `Console` / `ElectronBreadcrumbs` / `ElectronNet` turn logs and visited URLs
 *     into breadcrumbs — but an agent browser URL carries the REAL value
 *     (rule 11), and that's precisely what the product protects everywhere else.
 * So we enumerate what's ALLOWED (rule 7). A future SDK version that added
 * a chatty default has nothing to re-neutralize: it doesn't get in.
 */
export function initSentryMain(mode: "app" | "agent-browser" | "playwright-mcp", packaged: boolean): void {
  // An UNPACKAGED app reports too (product decision, 01/09/2026: a developer's instance
  // uses the common Sentry). History says why that is a trade-off, not a free lunch: dev
  // events once made 983 of the board's 1710 (57%). They are therefore TAGGED
  // `packaged:"false"` / `channel:"dev"` (below) so the board filters them, and
  // `OPENMASQ_SENTRY_DEV=0` closes the valve on one machine without touching the DSN.
  if (!packaged && process.env.OPENMASQ_SENTRY_DEV === "0") return;
  // No DSN supplied at build time ⇒ no telemetry at all — never a default project.
  if (!SENTRY_DSN) return;
  const channel = process.env.VITE_UPDATES_CHANNEL || "";
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: resolveEnvironment(channel),
    // ⚠️ `app.getVersion()`, NOT `process.env.VITE_APP_VERSION`: that define only
    // exists in the RENDERER bundle (`electron.vite.config.ts`), so here it's `undefined`
    // — and a report with no version doesn't attach to any release.
    release: app.getVersion(),
    defaultIntegrations: false,
    integrations: [
      // The TWO funnels that matter: what surfaces uncaught.
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
      // CHILD crashes — the most likely source in this app: the agent
      // browser (CDP, untrusted pages), the Python sandbox, the NER/fs workers.
      // ⚠️ EXPLICIT `events`: the SDK's default only promotes to an event
      // `abnormal-exit`/`launch-failed`/`integrity-failure` — `crashed` and `oom` (an
      // onnxruntime segfault in the NER worker, embed killed past its 120 MB) only became
      // breadcrumbs, which this file annihilates twice over (audit 13/08). `killed` and
      // `clean-exit` remain EXCLUDED: workers' idle eviction kills cleanly
      // every 10 min — promoting them would be noise by construction. The NAME of the
      // faulty worker comes from per-client reports (`localNer`/`embed`/`fs`/`broker`),
      // not from here: the SDK only puts `serviceName` in breadcrumbs.
      Sentry.childProcessIntegration({
        events: ["abnormal-exit", "launch-failed", "integrity-failure", "crashed", "oom"],
      }),
      // `cause`/`AggregateError`: a wrapped error keeps its real root cause.
      Sentry.linkedErrorsIntegration(),
      // Makes paths RELATIVE to the app before `scrubEvent` runs — the two
      // complement each other: this one normalizes, that one guarantees.
      Sentry.normalizePathsIntegration(),
    ],
    // Belt AND suspenders: `scrubEvent` doesn't copy breadcrumbs over
    // anyway, but NOT BUILDING them avoids holding them in memory in the meantime.
    beforeBreadcrumb: () => null,
    // The allow-list reconstruction. Everything leaves from here, or doesn't leave at all.
    beforeSend: (event) => sentryBeforeSend(event as never) as never,
    // No IP, no cookies, no headers: the default, reaffirmed because one day
    // someone will read this line wondering if we'd decided it.
    sendDefaultPii: false,
    // No performance traces at all: they name routes and queries.
    tracesSampleRate: 0,
    initialScope: { tags: { process: mode, channel: channel || "dev", packaged: String(packaged) } },
  });
}
