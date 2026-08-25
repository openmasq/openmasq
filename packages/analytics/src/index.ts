/**
 * @openmasq/analytics — the SHARED privacy-safe usage-analytics core, used by both
 * the desktop app (`@openmasq/ui/src/analytics`) and the browser extension
 * (`apps/extension/src/analytics`). Previously each surface carried its own
 * near-identical `sanitize` walk + transport (`posthog.ts` / `sink.ts`, ~290 LOC
 * duplicated) with an explicit "same contract so ONE relay serves both" note — this
 * package makes that literal so the two can't drift on WHAT is sent or HOW.
 *
 * Zero dependencies (browser globals only: `navigator`, `fetch`). The pieces that
 * genuinely differ per surface are INJECTED, not branched here:
 *  - the `allowed` event allow-list + per-field `bucketers` (each app's own event
 *    vocabulary and quantisation ranges),
 *  - `getAnonId` (desktop: sync localStorage; extension: async chrome.storage),
 *  - `defaultSource` ("desktop" / "extension") + a diagnostic `logPrefix`.
 *
 * Everything else — the double gate (transport configured AND consent AND not
 * DNT/GPC), the neutral relay envelope, the direct-PostHog fallback, and the
 * defence-in-depth allow-list walk that drops any non-declared key — is identical
 * and lives ONLY here. MANUAL events only: no posthog-js (its autocapture would
 * scrape the very text the app hides).
 *
 * Split by concern (hard rule 2), re-exported here so the public surface is
 * unchanged: `types` (the contracts), `sanitize` (the walk), `sink` (the transport),
 * `errorTracking` (scrubMessage + the $exception noise controls), `createAnalytics`
 * (les deux composés), `web` (la plomberie commune aux SITES — id anonyme, `$pageview`
 * dédoublonné, mode d'URL).
 */
export * from "./types";
export * from "./sanitize";
export * from "./sink";
export * from "./createAnalytics";
export * from "./web";
export { scrubMessage } from "./errorTracking";
// `isOperationalError` sort du tonneau parce qu'il a un SECOND canal : le `beforeSend` de
// Sentry côté bureau (`apps/desktop/src/sentry/policy.ts`). Ce qui compte comme « panne
// d'exploitation, pas un bug » est UN fait — il était tranché ici pour PostHog, et Sentry
// ne l'avait jamais reçu : 93 % de son volume était le bruit déjà écarté ailleurs.
export { isOperationalError } from "./errorTracking";
