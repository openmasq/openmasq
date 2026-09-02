/**
 * The public services a build reaches BY DEFAULT — and the only ones.
 *
 * The repository ships with no backend: no accounts API, no gateway, no sync, no
 * organizations, nothing sold (`buildDefines.ts`, the `OPENMASQ_BILLING` gate). What
 * remains reachable by default is small, public by nature, and needed for the product to
 * be USABLE as installed — so a build from the sources gets it too, without a CI:
 *
 * - the Supabase project (sign-in by magic link / Google): the URL and the PUBLISHABLE
 *   key are client credentials, designed to ship inside every client;
 * - the Slack relay (`https://auth.<domain>`): the code→token exchange Slack forbids on
 *   the device — without it the Slack connector is « non configuré » even with own keys;
 * - the analytics relay (`https://analytics.<domain>/e`): anonymous counters behind an
 *   explicit consent, the release notes the app shows, and the `hide-*` flags;
 * - the releases feed (`https://updates.<domain>`): what Settings → Versions lists, and
 *   what a PACKAGED app updates from (a dev instance never updates — `updates/index.ts`);
 * - the Sentry project (crash reports): a DSN only lets a client SEND events to one
 *   project, and what an event may carry is decided once in `src/sentry/policy.ts`
 *   (an allow-list rebuilt from scratch — never a vault value, a key, or a message);
 * - the desktop-direct connector OAuth clients (GitHub device flow, Slack via the auth
 *   relay, Microsoft multi-tenant): a client ID names an app, it authenticates nothing —
 *   every distributed binary already carries it in clear, so committing it hides no
 *   secret. What it DOES decide is whose app a build's consent screens belong to
 *   (product decision, 02/09/2026): GitHub / Slack / Microsoft work from a plain
 *   `git pull`, on the publisher's apps. « Mes clés » mode remains, and a fork that
 *   ships under its own identity sets its own ids — or empties them (`X=`) to get
 *   « non configuré » rather than the brand's consent screen. The Google client stays
 *   env-only: its flow also wants the client secret, and that one is an account's.
 *
 * **`pnpm dev` gets the SAME defaults** (product decision, 01/09/2026): a developer's
 * instance signs in on the common Supabase, counts in the common analytics, lists the
 * common releases and reports to the common Sentry — every event stamped
 * `env:"development"` / `packaged:false`, so the boards filter it, never lose it. There
 * is NO local value by default: a local stack is an explicit choice, made in a
 * gitignored `.env.development.local` (`apps/desktop/.env.development` says how).
 *
 * ⚠️ Two things this file does NOT do, on purpose:
 * - it never names a BILLING-gated address (backend, gateway) — those stay empty unless a
 *   CI opens the gate: `publicServices.test.ts` pins that the map cannot grow that way;
 * - it never overrides a variable that IS set — including one set EMPTY. `OPENMASQ_AUTH_URL=`
 *   is how a fork opts out of a relay it does not want to depend on; only `undefined`
 *   receives the default.
 */
/** The Supabase project behind sign-in. Project-specific: cannot derive from the brand. */
const SUPABASE_URL = "https://anounuyspkizsptfberu.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Sq6ZFX8-uKLht3ZhiVwccg_sO6E72Pz";

/** The Sentry project (`openmasq` org, `electron` project, EU region — `BRAND.sentryHost`
 *  names the org). Project-specific like Supabase: read from the project's client keys. */
const SENTRY_DSN =
  "https://d71bded67c98ccd36507d2ecd2894d2b@o4511977640558592.ingest.de.sentry.io/4511977659367504";

/** Desktop-direct connector OAuth clients — app IDENTIFIERS, not credentials (header). */
const GITHUB_CLIENT_ID = "Ov23liV0bczEMOMvB4y3";
const SLACK_CLIENT_ID = "11932971970983.11933393357959";
const MICROSOFT_CLIENT_ID = "c82277bc-dcca-4677-b3bd-9f343480d592";

export const PUBLIC_SERVICE_NAMES = [
  "OPENMASQ_SUPABASE_URL",
  "OPENMASQ_SUPABASE_PUBLISHABLE_KEY",
  "OPENMASQ_AUTH_URL",
  "VITE_ANALYTICS_RELAY_URL",
  "VITE_UPDATES_URL",
  "OPENMASQ_SENTRY_DSN",
  "OPENMASQ_GITHUB_CLIENT_ID",
  "OPENMASQ_SLACK_CLIENT_ID",
  "OPENMASQ_MICROSOFT_CLIENT_ID",
] as const;

export type PublicServiceName = (typeof PUBLIC_SERVICE_NAMES)[number];

/** The defaults, for a brand domain. Pure: what a build gets when the CI supplies nothing. */
export function publicServiceDefaults(brandDomain: string): Record<PublicServiceName, string> {
  return {
    OPENMASQ_SUPABASE_URL: SUPABASE_URL,
    OPENMASQ_SUPABASE_PUBLISHABLE_KEY: SUPABASE_PUBLISHABLE_KEY,
    OPENMASQ_AUTH_URL: `https://auth.${brandDomain}`,
    VITE_ANALYTICS_RELAY_URL: `https://analytics.${brandDomain}/e`,
    VITE_UPDATES_URL: `https://updates.${brandDomain}`,
    OPENMASQ_SENTRY_DSN: SENTRY_DSN,
    OPENMASQ_GITHUB_CLIENT_ID: GITHUB_CLIENT_ID,
    OPENMASQ_SLACK_CLIENT_ID: SLACK_CLIENT_ID,
    OPENMASQ_MICROSOFT_CLIENT_ID: MICROSOFT_CLIENT_ID,
  };
}

/**
 * Fill the UNSET public-service variables in `env`, in place, and return what was
 * applied. Dev or build alike (header). A variable already present — even as `""` — is
 * left exactly as it is.
 */
export function applyPublicServiceDefaults(
  env: NodeJS.ProcessEnv,
  opts: { brandDomain: string },
): Partial<Record<PublicServiceName, string>> {
  const applied: Partial<Record<PublicServiceName, string>> = {};
  const defaults = publicServiceDefaults(opts.brandDomain);
  for (const name of PUBLIC_SERVICE_NAMES) {
    if (env[name] !== undefined) continue;
    env[name] = defaults[name];
    applied[name] = defaults[name];
  }
  return applied;
}
