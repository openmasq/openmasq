/**
 * The FOUR public services a build reaches BY DEFAULT — and the only ones.
 *
 * The repository ships with no backend: no accounts API, no gateway, no sync, no
 * organizations, nothing sold (`buildDefines.ts`, the `OPENMASQ_BILLING` gate). What
 * remains hosted by the brand is small, public by nature, and needed for the product to
 * be USABLE as installed — so a build from the sources gets it too, without a CI:
 *
 * - the Supabase project (sign-in by magic link / Google): the URL and the PUBLISHABLE
 *   key are client credentials, designed to ship inside every client;
 * - the Slack relay (`https://auth.<domain>`): the code→token exchange Slack forbids on
 *   the device — without it the Slack connector is « non configuré » even with own keys;
 * - the analytics relay (`https://analytics.<domain>/e`): anonymous counters behind an
 *   explicit consent, the release notes the app shows, and the `hide-*` flags;
 * - the Sentry project (crash reports): a DSN only lets a client SEND events to one
 *   project, and what an event may carry is decided once in `src/sentry/policy.ts`
 *   (an allow-list rebuilt from scratch — never a vault value, a key, or a message).
 *
 * ⚠️ Three things this file does NOT do, on purpose:
 * - it never names a BILLING-gated address (backend, gateway) — those stay empty unless a
 *   CI opens the gate: `publicServices.test.ts` pins that the map cannot grow that way;
 * - it never applies in DEV: `pnpm dev` talks to LOCAL services only
 *   (`.env.development`), and a default that pointed a developer's machine at production
 *   auth and analytics would be the exact leak that convention exists to prevent;
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

export const PUBLIC_SERVICE_NAMES = [
  "OPENMASQ_SUPABASE_URL",
  "OPENMASQ_SUPABASE_PUBLISHABLE_KEY",
  "OPENMASQ_AUTH_URL",
  "VITE_ANALYTICS_RELAY_URL",
  "OPENMASQ_SENTRY_DSN",
] as const;

export type PublicServiceName = (typeof PUBLIC_SERVICE_NAMES)[number];

/** The defaults, for a brand domain. Pure: what a build gets when the CI supplies nothing. */
export function publicServiceDefaults(brandDomain: string): Record<PublicServiceName, string> {
  return {
    OPENMASQ_SUPABASE_URL: SUPABASE_URL,
    OPENMASQ_SUPABASE_PUBLISHABLE_KEY: SUPABASE_PUBLISHABLE_KEY,
    OPENMASQ_AUTH_URL: `https://auth.${brandDomain}`,
    VITE_ANALYTICS_RELAY_URL: `https://analytics.${brandDomain}/e`,
    OPENMASQ_SENTRY_DSN: SENTRY_DSN,
  };
}

/**
 * Fill the UNSET public-service variables in `env`, in place, and return what was
 * applied. `dev: true` applies nothing (see the header). A variable already present —
 * even as `""` — is left exactly as it is.
 */
export function applyPublicServiceDefaults(
  env: NodeJS.ProcessEnv,
  opts: { brandDomain: string; dev: boolean },
): Partial<Record<PublicServiceName, string>> {
  if (opts.dev) return {};
  const applied: Partial<Record<PublicServiceName, string>> = {};
  const defaults = publicServiceDefaults(opts.brandDomain);
  for (const name of PUBLIC_SERVICE_NAMES) {
    if (env[name] !== undefined) continue;
    env[name] = defaults[name];
    applied[name] = defaults[name];
  }
  return applied;
}
