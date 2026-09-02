/**
 * The main and renderer bundles' `define`s — pulled out of `electron.vite.config.ts`
 * (300 LOC cap, rule 1): this is a VOCABULARY of identifiers, not build config.
 * ⚠️ NO committed default here — neither for an identifier tied to a provider account
 * (GitHub/Slack/Google/Microsoft OAuth clients), NOR for a service's address (backend,
 * gateway): a public repo that embeds them routes every fork's traffic through THAT
 * account, and offers its users a SaaS that isn't theirs. Not supplied at build time ⇒
 * "" ⇒ the capability disables cleanly (no billing, no sync, no included models,
 * connector "not configured") and the app runs on the machine — personal keys, local
 * models, a subscription CLI, on-device redaction.
 * **The ONE exception is `scripts/publicServices.ts`**: sign-in (Supabase), the Slack
 * relay, the analytics relay, the releases feed and the Sentry DSN are filled by default
 * into `process.env` before these defines read it — in DEV as in a build, and never over
 * a variable that is set (set EMPTY is how a fork opts out) — because they are what makes
 * the installed product usable, and public by nature. Running against a LOCAL stack is an
 * explicit choice: `apps/desktop/.env.development` says how.
 */
/**
 * The API and gateway addresses — the ONLY remote services behind the
 * `OPENMASQ_BILLING` gate. Without `"1"`, they are baked EMPTY no matter what the build received:
 * no API accounts, no sync, no organizations, no reviews, no included
 * models nor server-side redaction, and therefore nothing to sell (`@openmasq/ui`
 * `send/platformAccess.ts` `subscriptionsSold`). They stay REACHABLE without the gate, because
 * they are not "the server" of the product: the Supabase project (authentication),
 * the Slack relay (`OPENMASQ_AUTH_URL`), analytics + release notes (the
 * `VITE_ANALYTICS_RELAY_URL` relay), the updates feed and Sentry — each on its own
 * variable, as before.
 */
export const BILLING_GATED_SERVICES = [
  "OPENMASQ_BACKEND_URL",
  "OPENMASQ_BACKEND_URL_STAGING",
  "OPENMASQ_GATEWAY_URL",
  "OPENMASQ_GATEWAY_URL_STAGING",
] as const;

/** `true` when this build embeds the full remote stack — and sells it. */
export function billingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OPENMASQ_BILLING === "1";
}

/** The first-party service addresses (backend + gateway, per environment) —
 *  ONE list, injected into both bundles: `src/environments/index.ts` is shared
 *  main/renderer, and a define missing on one side would leave the literal `process.env.…`
 *  as-is (it throws in a sandboxed renderer). Empty = capability absent, never a
 *  fallback onto the brand's servers. Pure (env as argument) so it can be tested:
 *  `buildDefines.test.ts` pins that the gate really closes these four, and nothing else. */
export function serviceDefines(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const open = billingEnabled(env);
  const gated = BILLING_GATED_SERVICES.map((name) => [
    `process.env.${name}`,
    JSON.stringify(open ? (env[name] ?? "") : ""),
  ]);
  const flags = [
    // ⚠️ `"1"` authorizes the SELF-HOSTED stack entered in the app (Settings → Versions) —
    // an accepted exception to "a name, never a URL" (`src/environments/customStack.ts`).
    // A self-hoster sets it for THEIR build; the brand's CI never sets it, and the
    // official binary reads a `custom` pointer just like production. Independent of
    // `OPENMASQ_BILLING`: it's THEIR server, not ours.
    "OPENMASQ_ALLOW_CUSTOM_STACK",
    // ⚠️ `"1"` = the full remote stack, AND selling it: the Billing tab, the
    // "Subscription required" badges, sync's paywall. Absent ⇒ the four addresses
    // above are empty, nothing sells and nothing mentions it — the product's DEFAULT.
    "OPENMASQ_BILLING",
  ].map((name) => [`process.env.${name}`, JSON.stringify(env[name] ?? "")]);
  return Object.fromEntries([...gated, ...flags]);
}

export function mainDefines(): Record<string, string> {
  return {
    "process.env.VITE_UPDATES_URL": JSON.stringify(process.env.VITE_UPDATES_URL ?? ""),
    "process.env.VITE_UPDATES_CHANNEL": JSON.stringify(process.env.VITE_UPDATES_CHANNEL ?? ""),
    // Desktop-direct MCP connector OAuth client ids (read in main `mcp/connectors`).
    // GitHub / Slack / Microsoft default to the publisher's apps via
    // `publicServices.ts` (which fills the UNSET ones before these lines read them —
    // the header there says why, and how a fork opts out with `X=`). Google alone has
    // no committed default: its flow also carries the client secret, an account's.
    // Empty ⇒ the connector shows "not configured" and "My keys" mode stays available.
    "process.env.OPENMASQ_GITHUB_CLIENT_ID": JSON.stringify(
      process.env.OPENMASQ_GITHUB_CLIENT_ID ?? "",
    ),
    "process.env.OPENMASQ_SLACK_CLIENT_ID": JSON.stringify(
      process.env.OPENMASQ_SLACK_CLIENT_ID ?? "",
    ),
    // The auth-only relay (apps/auth) that serves /slack/* — the code→token exchange
    // Slack forbids doing on-device (it requires a client secret). The endpoint is
    // PUBLIC (the secret lives in the function, never in the client), but it remains
    // SOMEONE's deployment: no committed default either, or every fork's Slack OAuth
    // would go through the brand's relay. Empty ⇒ the Slack connector says
    // "not configured" (`main/mcp/connectors/oauthSlack.ts`) and the others work.
    "process.env.OPENMASQ_AUTH_URL": JSON.stringify(process.env.OPENMASQ_AUTH_URL ?? ""),
    // Google "Desktop app" OAuth client — loopback 127.0.0.1 + PKCE. For an INSTALLED
    // app Google's own model treats the client_secret as NON-confidential (PKCE is the
    // real protection; `oauthGoogle.ts` says as much) — but it remains the identifier
    // of a specific Cloud project: env only, never committed.
    // ⚠️ ONLY safe because it is a "Desktop app" client type — a "Web application"
    // secret WOULD be confidential.
    "process.env.OPENMASQ_GOOGLE_CLIENT_ID": JSON.stringify(
      process.env.OPENMASQ_GOOGLE_CLIENT_ID ?? "",
    ),
    "process.env.OPENMASQ_GOOGLE_CLIENT_SECRET": JSON.stringify(
      process.env.OPENMASQ_GOOGLE_CLIENT_SECRET ?? "",
    ),
    // Microsoft identity platform PUBLIC "Desktop app" client id (loopback + PKCE,
    // NO secret). MULTI-TENANT (`/common`): SharePoint and Teams need a tenant ADMIN
    // to approve THIS app once for their organisation. The refusal a member hits
    // before that approval is turned into the link to forward
    // (`main/mcp/connectors/microsoftConsent.ts`); "Mes clés" stays available.
    "process.env.OPENMASQ_MICROSOFT_CLIENT_ID": JSON.stringify(
      process.env.OPENMASQ_MICROSOFT_CLIENT_ID ?? "",
    ),
    // The Supabase project + its PUBLISHABLE key and the Sentry DSN — read by
    // `src/environments/index.ts` and `src/sentry/policy.ts`, shared main/renderer
    // (the same define exists on the renderer side). Both arrive with a default
    // (`publicServices.ts`). Set EMPTY ⇒ no accounts / no Sentry.
    "process.env.OPENMASQ_SUPABASE_URL": JSON.stringify(process.env.OPENMASQ_SUPABASE_URL ?? ""),
    "process.env.OPENMASQ_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      process.env.OPENMASQ_SUPABASE_PUBLISHABLE_KEY ?? "",
    ),
    "process.env.OPENMASQ_SENTRY_DSN": JSON.stringify(process.env.OPENMASQ_SENTRY_DSN ?? ""),
    // Service ADDRESSES, same rule as the identifiers above: no
    // committed default — and behind the `OPENMASQ_BILLING` gate (see `serviceDefines`).
    // Empty ⇒ the app has neither a backend (accounts/billing/sync/reviews/org) nor a gateway
    // (cloud redaction + included models) — it runs on the machine. Read by
    // `src/environments/index.ts`, shared main/renderer. Deploying your own: the
    // private `infra` repo.
    ...serviceDefines(),
  };
}

/** The renderer counterpart — same identifiers for the SHARED modules the renderer
 *  also bundles (`src/environments`, `src/sentry/policy`): without these duplicates the
 *  literal `process.env.…` would stay as-is and throw (no `process` in a
 *  sandboxed renderer). */
export function rendererDefines(pkgVersion: string): Record<string, string> {
  return {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(process.env.VITE_APP_VERSION ?? pkgVersion),
    // The SAME channel as the main bundle, so Sentry tags both processes
    // with the same environment. Without this duplicate, the renderer would be "development" on
    // a production build — and bugs would get hunted in the wrong bucket.
    "import.meta.env.VITE_UPDATES_CHANNEL": JSON.stringify(process.env.VITE_UPDATES_CHANNEL ?? ""),
    // The renderer doesn't decide on updates, but it decides whether to SHOW their screen:
    // without a feed, `host.updates` stays absent (`appEnv.ts` UPDATES_CONFIGURED). Same
    // variable as the main bundle, duplicated for the same reason as the channel.
    "import.meta.env.VITE_UPDATES_URL": JSON.stringify(process.env.VITE_UPDATES_URL ?? ""),
    // Duplicates of the main defines for the SHARED modules the renderer
    // also bundles (`src/environments/index.ts` via appEnv, `src/sentry/policy.ts` via
    // sentry/renderer): without them, the literal `process.env.…` would stay as-is and
    // throw (`process` doesn't exist in a sandboxed renderer).
    "process.env.OPENMASQ_SUPABASE_URL": JSON.stringify(process.env.OPENMASQ_SUPABASE_URL ?? ""),
    "process.env.OPENMASQ_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      process.env.OPENMASQ_SUPABASE_PUBLISHABLE_KEY ?? "",
    ),
    "process.env.OPENMASQ_SENTRY_DSN": JSON.stringify(process.env.OPENMASQ_SENTRY_DSN ?? ""),
    ...serviceDefines(),
  };
}
