/**
 * THE environments this binary knows how to reach: a baked table indexed by an ENUMERATED
 * key, imported by main AND the renderer (one home for these addresses).
 *
 * ⚠️ The key is a NAME, never a URL: a free URL in a file the user (or a compromised
 * renderer) can write would be arbitrary egress from a signed binary holding the keychain.
 * An unknown key falls back to production.
 * ⚠️ The environment is NEVER DEDUCED from the updates channel: the same binary serves
 * candidates and the fleet, and ALL talk to production. The only path to staging is the
 * pointer WRITTEN by the privileged switch (`main/environment.ts`).
 * ⚠️ These values are NOT secrets: public addresses and a publishable key. No deployment
 * bypass secret belongs here (a single artifact would ship it to everyone).
 *
 * ⚠️ NO address has a committed default (the open-source contract): a fork's build must not
 * send its traffic to the brand's servers. Each service arrives at BUILD time; empty ⇒ the
 * capability doesn't exist and the app runs on the machine. Even when supplied, the API and
 * gateway only get in with `OPENMASQ_BILLING=1` (`scripts/buildDefines.ts`); sign-in is not
 * behind that gate.
 */

/**
 * The auth project's credentials arrive at BUILD time, with the brand's project as the
 * DEFAULT (`scripts/publicServices.ts`: a publishable key is made to ship in clients). Set
 * EMPTY to build without accounts: no client, no login gate, never silently someone else's
 * project. Local dev `VITE_*` overrides always win (`appEnv.ts`).
 */
const SUPABASE_URL = process.env.OPENMASQ_SUPABASE_URL ?? "";
const SUPABASE_PUBLISHABLE_KEY = process.env.OPENMASQ_SUPABASE_PUBLISHABLE_KEY ?? "";

/** The remote API and the gateway, per environment. Empty ⇒ the host slots don't exist
 *  (`appEnv.ts`). The admin site is DERIVED from the API address (rule 9). */
const BACKEND = process.env.OPENMASQ_BACKEND_URL ?? "";
const BACKEND_STAGING = process.env.OPENMASQ_BACKEND_URL_STAGING ?? "";
const GATEWAY = process.env.OPENMASQ_GATEWAY_URL ?? "";
const GATEWAY_STAGING = process.env.OPENMASQ_GATEWAY_URL_STAGING ?? "";

/** No API, no admin site: never an orphaned `/admin`. */
const adminOf = (backend: string): string =>
  backend ? `${backend.replace(/\/+$/, "")}/admin` : "";

/** The BAKED environments — the ones whose addresses the table below carries. */
export type BuiltEnvName = "production" | "staging";

/** All the names a pointer can carry. `"custom"` (`customStack.ts`) is HONORED only in a
 *  build that allows it; elsewhere it reads back as production. */
export type EnvName = BuiltEnvName | "custom";

export interface EnvUrls {
  /** The app's remote API (accounts, billing, sync, reviews). */
  backend: string;
  /** The organization admin console, opened in the system browser. */
  admin: string;
  /** The auth project and its PUBLISHABLE key (public by nature). */
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** The gateway (cloud redaction + inference for included models). */
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
    // The SAME auth project as production: accounts are shared, only the API differs.
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_PUBLISHABLE_KEY,
    redactFn: GATEWAY_STAGING,
  },
};

/** The default value, and the answer to any input we don't recognize. */
export const DEFAULT_ENV: BuiltEnvName = "production";

/** The allow-list, as a function. `"custom"` is a NAME; what it is worth is decided elsewhere. */
export function isEnvName(value: unknown): value is EnvName {
  return value === "production" || value === "staging" || value === "custom";
}

/** `true` for an environment whose addresses are BAKED (indexable in the table). */
export function isBuiltEnvName(value: unknown): value is BuiltEnvName {
  return value === "production" || value === "staging";
}
