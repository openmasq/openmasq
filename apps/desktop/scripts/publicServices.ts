/**
 * The public services a build reaches BY DEFAULT, and the only ones. The repository ships
 * with no API (`buildDefines.ts`, the `OPENMASQ_BILLING` gate); what remains is small,
 * public by nature, and needed for the product to be USABLE as installed:
 *
 * - sign-in: the URL and PUBLISHABLE key are client credentials, made to ship in clients;
 * - the Slack relay (`https://auth.<domain>`): the code→token exchange Slack forbids on
 *   the device;
 * - the analytics relay (`https://analytics.<domain>/e`): anonymous counters behind an
 *   explicit consent, and the release notes;
 * - the releases feed (`https://updates.<domain>`): only a PACKAGED app updates;
 * - crash reporting: a DSN only lets a client SEND; what an event may carry is decided in
 *   `src/sentry/policy.ts`;
 * - the connector OAuth client ids (GitHub, Slack, Microsoft): an id names an app and
 *   authenticates nothing; a fork sets its own or EMPTIES it (`X=`) to get « non
 *   configuré ». Google stays env-only: its flow also wants the client secret.
 *
 * `pnpm dev` gets the SAME defaults (events stamped `env:"development"`). Crash reporting
 * is the exception: only a DISTRIBUTED binary reports (`src/sentry/gate.ts`;
 * `OPENMASQ_SENTRY_DEV=1` is the valve). A package built OUTSIDE CI reports usage only,
 * stamped `env:"local"`. A local stack is an explicit choice (`.env.development.local`).
 *
 * ⚠️ This file never names a BILLING-gated address (`publicServices.test.ts` pins it), and
 * never overrides a variable that IS set, including one set EMPTY.
 */
/** The auth project behind sign-in. Project-specific: cannot derive from the brand. */
const SUPABASE_URL = "https://anounuyspkizsptfberu.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Sq6ZFX8-uKLht3ZhiVwccg_sO6E72Pz";

/** The crash-reporting DSN. Project-specific, like sign-in. */
const SENTRY_DSN =
  "https://d71bded67c98ccd36507d2ecd2894d2b@o4511977640558592.ingest.de.sentry.io/4511977659367504";

/** Connector OAuth clients: app IDENTIFIERS, not credentials (header). */
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

/** Fill the UNSET variables in place and return what was applied. `""` is left as is. */
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
