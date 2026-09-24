/**
 * The main and renderer bundles' `define`s: a VOCABULARY of identifiers.
 * ⚠️ NO committed default for an identifier tied to a provider account (OAuth clients) nor
 * for a service address (API, gateway): a public repo embedding them routes every fork's
 * traffic through THAT account. Not supplied ⇒ "" ⇒ the capability disables cleanly and the
 * app runs on the machine. The ONE exception is `scripts/publicServices.ts` (sign-in, the
 * feedback relay, analytics, the releases feed, crash reporting): public by nature, filled
 * before these defines read `process.env`, never over a variable that is set (set EMPTY
 * is how a fork opts out).
 */
/**
 * The API and gateway addresses: the ONLY remote services behind the `OPENMASQ_BILLING`
 * gate. Without `"1"` they are baked EMPTY whatever the build received, so nothing sells
 * (`@openmasq/ui` `send/platformAccess.ts`). The public services above stay reachable.
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

/** ONE list injected into BOTH bundles (`src/environments/index.ts` is shared; a define
 *  missing on one side leaves a literal `process.env.…` that throws in a sandboxed
 *  renderer). Pure, so `buildDefines.test.ts` pins that the gate closes exactly these. */
export function serviceDefines(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const open = billingEnabled(env);
  const gated = BILLING_GATED_SERVICES.map((name) => [
    `process.env.${name}`,
    JSON.stringify(open ? (env[name] ?? "") : ""),
  ]);
  const flags = [
    // `"1"` authorizes the SELF-HOSTED stack entered in the app (`src/environments/
    // customStack.ts`). A self-hoster sets it for THEIR build; independent of billing.
    "OPENMASQ_ALLOW_CUSTOM_STACK",
    // `"1"` = the full remote stack AND selling it. Absent is the product's DEFAULT.
    "OPENMASQ_BILLING",
  ].map((name) => [`process.env.${name}`, JSON.stringify(env[name] ?? "")]);
  return Object.fromEntries([...gated, ...flags]);
}

export function mainDefines(): Record<string, string> {
  return {
    "process.env.VITE_UPDATES_URL": JSON.stringify(process.env.VITE_UPDATES_URL ?? ""),
    "process.env.VITE_UPDATES_CHANNEL": JSON.stringify(process.env.VITE_UPDATES_CHANNEL ?? ""),
    // Desktop-direct connector OAuth client ids. GitHub / Slack / Microsoft default to the
    // publisher's apps via `publicServices.ts`; Google has no default (its flow carries a
    // secret). Empty ⇒ "not configured", "My keys" mode stays available.
    "process.env.OPENMASQ_GITHUB_CLIENT_ID": JSON.stringify(
      process.env.OPENMASQ_GITHUB_CLIENT_ID ?? "",
    ),
    "process.env.OPENMASQ_SLACK_CLIENT_ID": JSON.stringify(
      process.env.OPENMASQ_SLACK_CLIENT_ID ?? "",
    ),
    // The relay for Slack's code→token exchange (it requires a client secret, never in
    // the client). SOMEONE's deployment: no committed default. Empty ⇒ Slack says
    // "not configured" (`main/mcp/connectors/oauthSlack.ts`).
    "process.env.OPENMASQ_AUTH_URL": JSON.stringify(process.env.OPENMASQ_AUTH_URL ?? ""),
    // Google "Desktop app" client (loopback + PKCE): its client_secret is NON-confidential
    // for THAT client type only — a "Web application" secret WOULD be. Env only.
    "process.env.OPENMASQ_GOOGLE_CLIENT_ID": JSON.stringify(
      process.env.OPENMASQ_GOOGLE_CLIENT_ID ?? "",
    ),
    "process.env.OPENMASQ_GOOGLE_CLIENT_SECRET": JSON.stringify(
      process.env.OPENMASQ_GOOGLE_CLIENT_SECRET ?? "",
    ),
    // Microsoft PUBLIC client (loopback + PKCE, NO secret), multi-tenant: a tenant ADMIN
    // approves once; the refusal becomes a link to forward (`microsoftConsent.ts`).
    "process.env.OPENMASQ_MICROSOFT_CLIENT_ID": JSON.stringify(
      process.env.OPENMASQ_MICROSOFT_CLIENT_ID ?? "",
    ),
    // The auth project + PUBLISHABLE key and the crash-report DSN, shared main/renderer.
    // Defaults from `publicServices.ts`; set EMPTY ⇒ no accounts / no crash reports.
    "process.env.OPENMASQ_SUPABASE_URL": JSON.stringify(process.env.OPENMASQ_SUPABASE_URL ?? ""),
    "process.env.OPENMASQ_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      process.env.OPENMASQ_SUPABASE_PUBLISHABLE_KEY ?? "",
    ),
    "process.env.OPENMASQ_SENTRY_DSN": JSON.stringify(process.env.OPENMASQ_SENTRY_DSN ?? ""),
    // Service ADDRESSES: no committed default, behind the billing gate (`serviceDefines`).
    ...serviceDefines(),
  };
}

/** The renderer counterpart: the SHARED modules it bundles need the same defines, or a
 *  literal `process.env.…` throws in the sandboxed renderer. */
export function rendererDefines(pkgVersion: string): Record<string, string> {
  return {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(process.env.VITE_APP_VERSION ?? pkgVersion),
    // The SAME channel and feed as the main bundle, so both processes report the same
    // environment and the renderer knows whether to SHOW the updates screen.
    "import.meta.env.VITE_UPDATES_CHANNEL": JSON.stringify(process.env.VITE_UPDATES_CHANNEL ?? ""),
    "import.meta.env.VITE_UPDATES_URL": JSON.stringify(process.env.VITE_UPDATES_URL ?? ""),
    "process.env.OPENMASQ_SUPABASE_URL": JSON.stringify(process.env.OPENMASQ_SUPABASE_URL ?? ""),
    "process.env.OPENMASQ_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      process.env.OPENMASQ_SUPABASE_PUBLISHABLE_KEY ?? "",
    ),
    "process.env.OPENMASQ_SENTRY_DSN": JSON.stringify(process.env.OPENMASQ_SENTRY_DSN ?? ""),
    ...serviceDefines(),
  };
}
