/**
 * THE environments this binary knows how to reach — a table, baked, indexed by an
 * ENUMERATED key. Imported by main AND by the renderer (like `src/sentry/`), so there's
 * only one home for these addresses.
 *
 * ⚠️ **The key is a name, never a URL, and it's the single most important guard in this file.**
 * What gets persisted and read back is `"staging"` or `"production"` — not an address. A free
 * URL in a file the user can edit (or that a compromised renderer could
 * write) would amount to arbitrary egress from a signed, notarized binary holding the
 * keychain. An unknown key falls back to production, never to whatever it claims to be.
 *
 * ⚠️ **The environment is NEVER DEDUCED from the updates channel.** That's the single-
 * artifact contract: the same binary serves candidates (beta channel) and the fleet (stable
 * channel), and ALL of them talk to production — a candidate is the real software ahead of
 * schedule, not a test environment. The only path to staging is the pointer WRITTEN by the
 * privileged switch (`main/environment.ts`). The old channel→environment derivation
 * (`envNameForChannel`) was removed so no one could plug it back in "because
 * it was there".
 *
 * ⚠️ These values are NOT secrets: public addresses and the Supabase publishable
 * key. Staging's Vercel bypass is NOT here and has no business being here — a single
 * artifact would ship it to everyone (see `apps/desktop/CLAUDE.md`).
 */
/**
 * ⚠️ **NO address has a committed default, and that's the open-source contract.** A
 * public repo whose build fell back to the brand's servers would send each fork's
 * traffic back to it, and would offer its users a connection to a
 * SaaS that isn't theirs. Each service therefore arrives at BUILD time; **empty ⇒ the
 * capability doesn't exist** (no accounts, no billing, no sync, no gateway), and
 * the app runs entirely on the machine: personal keys, local models, subscription
 * CLI, on-device redaction. Same rule as the OAuth credentials and the Sentry
 * DSN (`scripts/buildDefines.ts`), extended to addresses. How to supply your own
 * stack: the private `infra` repo.
 *
 * ⚠️ **And even when supplied, the API and gateway only get in with `OPENMASQ_BILLING=1`**
 * (`scripts/buildDefines.ts` `serviceDefines`): without the gate, the build bakes them empty.
 * The Supabase project, though, isn't behind it — auth stays reachable
 * on its own, like the Slack relay, analytics and updates.
 */

/**
 * The Supabase PROJECT credentials arrive at BUILD time (`OPENMASQ_SUPABASE_URL` /
 * `OPENMASQ_SUPABASE_PUBLISHABLE_KEY`, baked into literals by electron.vite.config.ts's
 * `define`s — main AND renderer), with the brand's project as the DEFAULT of every
 * build, `pnpm dev` included (`scripts/publicServices.ts`: sign-in is what makes the
 * installed product usable, and a publishable key is made to ship in clients). Set the
 * variable EMPTY to build without accounts: `auth.ts` then builds no client and the
 * `host.auth` slot stays absent (no login gate) — never silently someone else's project.
 * Against a LOCAL GoTrue, `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`
 * (`.env.development.local`) always win (`appEnv.ts`).
 */
const SUPABASE_URL = process.env.OPENMASQ_SUPABASE_URL ?? "";
const SUPABASE_PUBLISHABLE_KEY = process.env.OPENMASQ_SUPABASE_PUBLISHABLE_KEY ?? "";

/** The remote API (accounts, billing, sync, reviews, org) and the gateway
 *  (cloud redaction + inference for included models), per environment. Empty ⇒ these
 *  host slots don't exist (`appEnv.ts`: `BACKEND_CONFIGURED` /
 *  `GATEWAY_CONFIGURED`). The admin console has NO variable of its own: it's served by
 *  the backend, so derived from it — two addresses for a single deployment would be
 *  two chances to diverge (rule 9). */
const BACKEND = process.env.OPENMASQ_BACKEND_URL ?? "";
const BACKEND_STAGING = process.env.OPENMASQ_BACKEND_URL_STAGING ?? "";
const GATEWAY = process.env.OPENMASQ_GATEWAY_URL ?? "";
const GATEWAY_STAGING = process.env.OPENMASQ_GATEWAY_URL_STAGING ?? "";

/** The admin console lives UNDER the backend (`/admin`). No backend, no console —
 *  never an orphaned `/admin` that would open a blank page. */
const adminOf = (backend: string): string =>
  backend ? `${backend.replace(/\/+$/, "")}/admin` : "";

/** The BAKED environments — the ones whose addresses the table below carries. */
export type BuiltEnvName = "production" | "staging";

/**
 * All the names a pointer can carry. `"custom"` is the SELF-HOSTED stack
 * (`customStack.ts`): its addresses aren't here, they live in the pointer written
 * by main — and the name is HONORED only in a build that allows it
 * (`OPENMASQ_ALLOW_CUSTOM_STACK=1`); elsewhere it reads back as production.
 */
export type EnvName = BuiltEnvName | "custom";

export interface EnvUrls {
  /** The app's remote API (accounts, billing, sync, reviews). */
  backend: string;
  /** The organization admin console, opened in the system browser. */
  admin: string;
  /** The Supabase project and its PUBLISHABLE key (client credentials, public by nature). */
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** The gateway/redact-fn container (cloud redaction + inference for included models).
   *  Canonical hostnames held by Terraform, on the infra side. */
  redactFn: string;
}

export const ENVIRONMENTS: Record<BuiltEnvName, EnvUrls> = {
  production: {
    backend: BACKEND,
    admin: adminOf(BACKEND),
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_PUBLISHABLE_KEY,
    redactFn: GATEWAY,
  },
  staging: {
    backend: BACKEND_STAGING,
    admin: adminOf(BACKEND_STAGING),
    // The SAME Supabase project as production: accounts are shared, only
    // the app's API differs. The day staging gets its own project, that's a
    // second pair of variables to introduce here, and nowhere else.
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_PUBLISHABLE_KEY,
    redactFn: GATEWAY_STAGING,
  },
};

/** The default value, and the answer to any input we don't recognize. */
export const DEFAULT_ENV: BuiltEnvName = "production";

/** `true` if `value` is a known environment name — the allow-list, as a function.
 *  `"custom"` is part of it: it's a NAME; what the name is worth (entered addresses)
 *  is decided elsewhere, and only in a build that allows it. */
export function isEnvName(value: unknown): value is EnvName {
  return value === "production" || value === "staging" || value === "custom";
}

/** `true` for an environment whose addresses are BAKED (indexable in the table). */
export function isBuiltEnvName(value: unknown): value is BuiltEnvName {
  return value === "production" || value === "staging";
}
