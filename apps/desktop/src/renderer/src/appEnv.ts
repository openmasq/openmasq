/**
 * THE only reader of `import.meta.env` in the desktop renderer: a copied default is a
 * second home for an address (rule 9).
 *
 * ⚠️ The runtime environment switch goes THROUGH HERE and nowhere else: main resolves the
 * environment and hands it back synchronously (`env.resolved()`); this module prefers it
 * over baked values. CI bakes no URL; only local-dev `VITE_*` variables still win.
 *
 * ⚠️ A default is a PRODUCTION VALUE, never a silent fallback to local. The one exception
 * is `UPDATES_CHANNEL`, below.
 *
 * ⚠️ NOT named `env.ts`: `env.d.ts` beside it carries the Vite types and the global
 * `window.openmasq`, and an `env.ts` would make TypeScript take that `.d.ts` for its own
 * declarations — the globals vanish from the WHOLE renderer.
 */

import { DEFAULT_ENV, ENVIRONMENTS } from "../../environments";

const env = import.meta.env as unknown as Record<string, string | undefined>;

/** Development build (`electron-vite dev`), never an installed package. Internal:
 *  what's exposed outward is `BUILD_ENV` and `ANALYTICS_DEBUG`. */
const IS_DEV: boolean = Boolean(import.meta.env.DEV);

/** The environment of THIS build. Addresses come from the shared table
 *  (`src/environments/`), which main uses too; a `VITE_*` variable always wins. */
const RESOLVED = window.openmasq?.env?.resolved?.() ?? null;

/** The effective environment of THIS instance; without main (preview), production.
 *  NEVER deduced from the channel: a beta candidate talks to production (`../../environments`). */
const ENV_NAME = RESOLVED?.name ?? DEFAULT_ENV;

// An entered stack NEVER arrives here — only resolved by main.
const URLS = RESOLVED ?? ENVIRONMENTS[DEFAULT_ENV];

/** The app's remote API (accounts, billing, sync, reviews). EMPTY = this build has
 *  no backend, and that's a NORMAL state (`../../environments`). */
export const BACKEND_URL: string = env.VITE_BACKEND_URL || URLS.backend;

/**
 * Does this build have a remote API? The host slots `sync` / `org` / `billing` / `avis`
 * (`main.tsx`) depend on it: absent ⇒ these surfaces don't exist, rather than spinning in
 * the void. Read HERE, never by recomposing a `!!URL` elsewhere (rule 9).
 */
export const BACKEND_CONFIGURED: boolean = !!BACKEND_URL;

/**
 * Does this build embed the remote stack and sell it? `OPENMASQ_BILLING=1` at build time,
 * the SAME gate that lets in the API and gateway addresses (`scripts/buildDefines.ts`):
 * without it no billing, sync, organizations or included models, and no surface says
 * "subscription" (`@openmasq/ui` `send/platformAccess.ts`). Sign-in, the feedback relay,
 * analytics and updates do not depend on it.
 */
export const BILLING_SOLD: boolean = process.env.OPENMASQ_BILLING === "1";

/** The EFFECTIVE environment name, SHOWN in Settings so the app says who it talks to. */
export const ENV_DISPLAY_NAME: string = ENV_NAME;

/** The same, TYPED, for the `host.env` slot. */
export const RUNTIME_ENV: "production" | "staging" | "custom" = ENV_NAME;

/** Does this build honor a SELF-HOSTED stack entered in the app (`OPENMASQ_ALLOW_CUSTOM_STACK=1`
 *  at build, handed back by main)? Makes the card EXIST even in a build with no API baked in. */
export const CUSTOM_STACK_ALLOWED: boolean = RESOLVED?.customStackAllowed === true;

/** The already-known entered stack (to pre-fill the screen), `null` without. */
export const CUSTOM_STACK = RESOLVED?.customStack ?? null;

/**
 * The deployment-protection bypass secret for a protected API deployment (see
 * `backendFetch.ts`). LOCAL DEV ONLY: no CI build may embed it, a build guard refuses the
 * pairing of channel + bypass (`electron.vite.config.ts` `assertNoBakedBypass`).
 */
export const BACKEND_BYPASS: string = env.VITE_BACKEND_BYPASS || "";

/** The organization admin console, opened in the system browser. */
export const ADMIN_URL: string = env.VITE_ADMIN_URL || URLS.admin;

/** Auth client credentials — PUBLIC by nature (publishable key), so embedded. */
export const SUPABASE_URL: string = env.VITE_SUPABASE_URL || URLS.supabaseUrl;
export const SUPABASE_ANON_KEY: string = env.VITE_SUPABASE_ANON_KEY || URLS.supabaseAnonKey;

/**
 * The updates channel baked at build time (`desktop-beta` / `desktop-stable`).
 * ⚠️ Empty means "local", NEVER "production": only CI sets it, and a local build (a bench,
 * an e2e spec) must not count as a real install.
 */
const UPDATES_CHANNEL: string = env.VITE_UPDATES_CHANNEL || "";

/**
 * Is there an updates FEED in this build? Same variable as main (`main/updates/config.ts`).
 * Updating from someone else's feed means getting your binary replaced: NO default.
 */
export const UPDATES_CONFIGURED: boolean = !!env.VITE_UPDATES_URL;

/**
 * The environment stamped on analytics events and error reports. Follows the RESOLVED
 * environment; `development` and `local` remain BUILD states, never a deployed one.
 */
export const BUILD_ENV: "development" | "local" | "staging" | "production" | "custom" = IS_DEV
  ? "development"
  : !UPDATES_CHANNEL && !RESOLVED
    ? "local"
    : ENV_NAME;

/** The first-party analytics relay. The app NEVER holds an analytics key: it POSTs the
 *  neutral envelope, the relay signs it. ⚠️ No default: EMPTY ⇒ the sink is a no-op and
 *  the "What's new" card has no source. */
export const ANALYTICS_RELAY_URL: string = env.VITE_ANALYTICS_RELAY_URL || "";

/** Release notes, served by the same service as the relay (`/release-notes`).
 *  `undefined` ⇒ Settings → Versions shows the versions without the notes. */
export const RELEASE_NOTES_URL: string | undefined = ANALYTICS_RELAY_URL
  ? `${ANALYTICS_RELAY_URL.replace(/\/e\/?$/, "")}/release-notes`
  : undefined;

/** The version displayed and stamped on events. */
export const APP_VERSION: string | undefined = env.VITE_APP_VERSION;

/** Log every analytics event (sent / skipped + reason). Always on in
 *  dev; `VITE_POSTHOG_DEBUG=1` also turns it on in an installed package. */
export const ANALYTICS_DEBUG: boolean = IS_DEV || env.VITE_POSTHOG_DEBUG === "1";

/** The gateway: cloud redaction AND inference for the included models. Per-environment
 *  (the table); a `VITE_*` variable still wins in local dev. */
export const REDACT_FN_URL: string = env.VITE_REDACT_FN_URL || URLS.redactFn;

/** Empty ⇒ the platform-served models become unavailable instead of failing on send
 *  (`@openmasq/ui` `modelAvailability`). */
export const GATEWAY_CONFIGURED: boolean = !!REDACT_FN_URL;
