[Français](README.fr.md)

# @openmasq/analytics

**The privacy-safe usage analytics core of OpenMasq.**

It decides what an analytics event may contain and when it may leave. `@openmasq/ui` builds
the desktop app's analytics on it (`packages/ui/src/analytics/`), and the desktop's Sentry
filter reuses its `isOperationalError`. Events are manual only, with no autocapture. The
package has no dependencies and uses browser globals only.

## What's inside

- **Sanitiser**: `makeSanitize` drops every key the event vocabulary does not declare and
  turns flagged numbers into coarse ranges (`src/sanitize.ts`).
- **Transport**: `createSink` sends to the relay, or straight to PostHog as a fallback. It
  sends nothing unless a transport is configured, the user has consented, and Do Not Track
  or GPC is off. Events wait in a short queue until consent is known (`src/sink.ts`).
- **Error channel**: `captureError` sends a `$exception` event; `scrubMessage` strips
  e-mails, credentials, long tokens, digit runs and paths from its message
  (`src/errorTracking.ts`).
- **Feature flags**: `fetchFlags` reads the relay's flags. It is configuration, not
  measurement, so it does not wait for consent (`src/flags.ts`).
- **Vocabulary**: `DESKTOP_EVENTS`, `VOCABULARY` and `admit()`, the rule the relay applies.
  The list the app sanitises against and the list the relay admits are the same object
  (`src/vocabulary/`).
- **Sites**: `createWebAnalytics`, the shared plumbing for the websites (`src/web.ts`).

## Develop

```bash
pnpm --filter @openmasq/analytics build       # tsup → dist/, rebuild before a consumer build
pnpm --filter @openmasq/analytics typecheck
pnpm test packages/analytics                  # from the repository root
```

> [!IMPORTANT]
> Never add a path that sends a raw payload: the allow-list walk is the single choke point.
> What a build sends, and how to turn it off, is in the root README under
> [Data collection & usage](../../README.md#data-collection--usage).
