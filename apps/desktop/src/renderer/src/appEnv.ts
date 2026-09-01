/**
 * THE only reader of `import.meta.env` in the desktop renderer — same role as
 * `apps/web/lib/env.ts` on the console side.
 *
 * Before, sixteen reads across six modules, and defaults copied along with them:
 * the production URL was written THREE times (`avis.ts`, `billing.ts`,
 * `sync/client.ts`), the relay URL twice, `VITE_REDACT_FN_URL` twice. A
 * copied default is not harmless redundancy: the day the app points elsewhere,
 * one always remains (rule 9).
 *
 * ⚠️ **The runtime environment switch goes THROUGH HERE, and nowhere else.**
 * Main resolves the environment (pointer written, otherwise production) and hands it
 * back synchronously (`env.resolved()`); this module prefers it over baked values. CI no
 * longer bakes ANY URL at all (release.yml) — only the local dev `VITE_*` variables
 * still win. Consumers see none of this.
 *
 * ⚠️ A default is a PRODUCTION VALUE, never a silent fallback to local:
 * an installed app that can't find its variable must talk to the real service, not to
 * nothing. The only exception is `UPDATES_CHANNEL`, see below.
 *
 * ⚠️ **The name is not `env.ts`, and that's not a preference.** `env.d.ts` already
 * exists in this folder: it carries `/// <reference types="vite/client" />` and the global
 * `window.openmasq`. An `env.ts` next to it makes TypeScript take `env.d.ts` for ITS
 * own declarations instead of a globals file — and `window.openmasq` along with the Vite
 * types disappear from the WHOLE renderer, in dozens of errors that don't point to
 * the cause. Do not rename it `env.ts`.
 */

import { DEFAULT_ENV, ENVIRONMENTS } from "../../environments";

const env = import.meta.env as unknown as Record<string, string | undefined>;

/** Development build (`electron-vite dev`), never an installed package. Internal:
 *  what's exposed outward is `BUILD_ENV` and `ANALYTICS_DEBUG`. */
const IS_DEV: boolean = Boolean(import.meta.env.DEV);

/**
 * The environment of THIS build, and the addresses that go with it.
 *
 * ⚠️ The addresses come from the shared table (`src/environments/`), not from literals
 * copied here: main uses it too (the `userData` profile, and tomorrow the switch), and two
 * homes for "the API URL" are two values to fix the day it moves.
 * A `VITE_*` variable always wins — that's what makes `.env.development` work
 * (everything on localhost) and a CI build pointed elsewhere.
 */
const RESOLVED = window.openmasq?.env?.resolved?.() ?? null;

/** The effective environment of THIS instance. Main resolved it (pointer written, otherwise
 *  production) and hands it back synchronously; without it — preload not restarted in dev, browser
 *  preview — production answers. NEVER deduced from the channel: a candidate (beta channel)
 *  talks to production, that's the single-artifact contract (`../../environments`). */
const ENV_NAME = RESOLVED?.name ?? DEFAULT_ENV;

// Without main (preview, preload not restarted), `ENV_NAME` is production: the baked table
// answers. An entered stack NEVER arrives here — only resolved by main.
const URLS = RESOLVED ?? ENVIRONMENTS[DEFAULT_ENV];

/** The app's remote API (accounts, billing, sync, reviews). EMPTY = this build has
 *  no backend, and that's a NORMAL state (`../../environments`). */
export const BACKEND_URL: string = env.VITE_BACKEND_URL || URLS.backend;

/**
 * Does this build have a backend? That's THE question the host slots
 * `sync` / `org` / `orgShares` / `billing` / `avis` (`main.tsx`) depend on. Absent ⇒ these surfaces
 * don't exist at all, rather than existing and never answering: an "Account"
 * tab spinning in the void is worse than a missing tab.
 *
 * ⚠️ The exact counterpart of `AUTH_CONFIGURED` (`auth.ts`), and it's read HERE, never by
 * recomposing a `!!URL` elsewhere (rule 9).
 */
export const BACKEND_CONFIGURED: boolean = !!BACKEND_URL;

/**
 * Does this build embed the remote stack — and sell it? `OPENMASQ_BILLING=1` at
 * build time, and nothing else. It's the SAME gate that lets in the API and
 * gateway addresses (`scripts/buildDefines.ts` `serviceDefines`): without it, `BACKEND_URL`
 * and `REDACT_FN_URL` are empty (outside dev `VITE_*`), so no `billing` slot
 * (no Payment tab), no sync, no organizations, no included models — and
 * no surface says "subscription" (`@openmasq/ui` `send/platformAccess.ts`
 * `subscriptionsSold`). Supabase auth, the Slack relay, analytics and
 * updates do not depend on it.
 */
export const BILLING_SOLD: boolean = process.env.OPENMASQ_BILLING === "1";

/** The EFFECTIVE environment name of this instance — what the switch resolved,
 *  not what the channel suggests. Exposed to be SHOWN (Settings → Sync):
 *  an app that doesn't say who it's talking to leaves diagnosis blind. */
export const ENV_DISPLAY_NAME: string = ENV_NAME;

/** The effective environment name, TYPED, for the `host.env` slot (the Settings →
 *  Versions Environment card) — the discriminated union the switch expects. */
export const RUNTIME_ENV: "production" | "staging" | "custom" = ENV_NAME;

/** Does this build honor a SELF-HOSTED stack entered in the app? Baked at build time
 *  (`OPENMASQ_ALLOW_CUSTOM_STACK=1`) and handed back by main with the resolved environment; without
 *  main (preview), no. This is what makes the "Self-hosted stack" card EXIST — and the
 *  `host.env` slot even in a build with no backend baked in at all, since that's precisely
 *  where one gets entered. */
export const CUSTOM_STACK_ALLOWED: boolean = RESOLVED?.customStackAllowed === true;

/** The already-known entered stack (to pre-fill the screen), `null` without. */
export const CUSTOM_STACK = RESOLVED?.customStack ?? null;

/**
 * The Vercel automation secret that gets past STAGING's deployment
 * protection (`x-vercel-protection-bypass`, see `backendFetch.ts`). LOCAL DEV
 * ONLY: from the single-artifact principle, no CI build is allowed to embed it
 * — the same binary serves every channel, and a build guard refuses the pairing
 * of channel + bypass (`electron.vite.config.ts` `assertNoBakedBypass`).
 */
export const BACKEND_BYPASS: string = env.VITE_BACKEND_BYPASS || "";

/** The organization admin console, opened in the system browser. */
export const ADMIN_URL: string = env.VITE_ADMIN_URL || URLS.admin;

/** Supabase client credentials — PUBLIC by nature (publishable key), so embedded. */
export const SUPABASE_URL: string = env.VITE_SUPABASE_URL || URLS.supabaseUrl;
export const SUPABASE_ANON_KEY: string = env.VITE_SUPABASE_ANON_KEY || URLS.supabaseAnonKey;

/**
 * The updates channel baked at build time (`desktop-beta` / `desktop-stable`).
 *
 * ⚠️ **Empty means "local", NEVER "production".** Only CI sets this
 * variable. The default is therefore not a production URL like the others: an
 * old ternary fell back to `"production"` as soon as it was empty, so that every
 * local build — a bench, an e2e spec, a trial run — disguised itself as a real user.
 * Measured in PostHog: 277 out of 278 production "installs" had lived only
 * one day, half of them less than a minute. A produced figure is only as good
 * as this field.
 */
const UPDATES_CHANNEL: string = env.VITE_UPDATES_CHANNEL || "";

/**
 * Is there an updates FEED in this build? Same variable as the main process
 * (`main/updates/config.ts`), mirrored here by a renderer `define` — without it, the
 * `host.updates` slot stays absent and neither the "Update" card nor the version
 * history display. Updating from someone else's feed means getting your binary
 * replaced: so there is no default (private `infra` repo).
 */
export const UPDATES_CONFIGURED: boolean = !!env.VITE_UPDATES_URL;

/**
 * The environment stamped on every analytics event and on error
 * reports.
 *
 * ⚠️ It follows the RESOLVED environment once main hands it back — without which an install
 * switched to staging would keep counting as production, and the two streams would
 * mix in the numbers. `development` and `local` remain BUILD states:
 * a `pnpm dev` run and a build outside CI have nothing to do with a deployed environment, and
 * conflating them is what made 277 local launches pass for installs.
 */
export const BUILD_ENV: "development" | "local" | "staging" | "production" | "custom" = IS_DEV
  ? "development"
  : !UPDATES_CHANNEL && !RESOLVED
    ? "local"
    : ENV_NAME;

/** The first-party analytics relay (`apps/analytics-fn`). The desktop app NEVER
 *  holds a PostHog key: it POSTs the neutral envelope, the relay signs it. */
/** ⚠️ No default: EMPTY ⇒ the analytics sink is a no-op (`@openmasq/analytics`
 *  opens no transport without a relay or without a key) and the "What's new" card has
 *  no source — neither one falls back to the brand's host. */
export const ANALYTICS_RELAY_URL: string = env.VITE_ANALYTICS_RELAY_URL || "";

/** Release notes, served by the same service as the relay (`/release-notes`).
 *  `undefined` ⇒ Settings → Versions shows the versions without the notes. */
export const RELEASE_NOTES_URL: string | undefined = ANALYTICS_RELAY_URL
  ? `${ANALYTICS_RELAY_URL.replace(/\/e\/?$/, "")}/release-notes`
  : undefined;
// (Retiré le 01/09/2026 : ANALYTICS_APP_KEY — la requête vers le relais est
// authentifiée par la session Supabase, plus par une clé HMAC bakée.)

/** The version displayed and stamped on events. */
export const APP_VERSION: string | undefined = env.VITE_APP_VERSION;

/** Log every analytics event (sent / skipped + reason). Always on in
 *  dev; `VITE_POSTHOG_DEBUG=1` also turns it on in an installed package. */
export const ANALYTICS_DEBUG: boolean = IS_DEV || env.VITE_POSTHOG_DEBUG === "1";

/** The redact-fn container — cloud redaction engine AND inference proxy for the
 *  included models. Per-environment, so resolved via the table (CI no longer bakes it); a
 *  `VITE_*` variable still wins, that's the local-dev path. */
export const REDACT_FN_URL: string = env.VITE_REDACT_FN_URL || URLS.redactFn;

/** Is the gateway provided? It serves TWO things: cloud redaction and
 *  inference for the "included" models. Empty ⇒ neither one, and the models
 *  served by the platform become unavailable instead of failing on send
 *  (`@openmasq/ui` `modelAvailability`). */
export const GATEWAY_CONFIGURED: boolean = !!REDACT_FN_URL;
