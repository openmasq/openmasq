/**
 * The environment-switch DECISION, and the payload the renderer receives — without
 * Electron, without disk, without network.
 *
 * Separated from the wiring (`registerEnvIpc.ts`) for a reason as mechanical as it is
 * of principle: the latter pulls in `updates/channel` for the server permission, hence
 * `electron-updater`, which doesn't load outside Electron. A gate that can't be
 * tested ends up being verified only in one's head.
 */
import { ENVIRONMENTS, isBuiltEnvName, isEnvName, type EnvName, type EnvUrls } from "../../environments";
import { CUSTOM_STACK_ALLOWED, customEnvUrls, type CustomStack } from "../../environments/customStack";

/** The state the renderer reads AT LOAD, synchronously: it needs it before creating
 *  the Supabase client, i.e. before any asynchronous round trip. Nothing secret here —
 *  a name, public addresses, and the entered stack (public addresses and a
 *  PUBLISHABLE key) to pre-fill the screen. */
export interface ResolvedEnv {
  name: EnvName;
  backend: string;
  admin: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  redactFn: string;
  /** Does this build honor an entered stack? Baked at build time (`OPENMASQ_ALLOW_CUSTOM_STACK`). */
  customStackAllowed: boolean;
  /** The entered stack known to the pointer — `null` without one, or in a build that doesn't honor it. */
  customStack: CustomStack | null;
}

const EMPTY: EnvUrls = { backend: "", admin: "", supabaseUrl: "", supabaseAnonKey: "", redactFn: "" };

/** An environment's addresses — baked for production/staging, entered for custom.
 *  A `custom` with no stack is EMPTY, never a fallback to production: that would be
 *  precisely talking to a backend the user hasn't chosen. */
export function envUrls(name: EnvName, custom: CustomStack | null): EnvUrls {
  if (isBuiltEnvName(name)) return ENVIRONMENTS[name];
  return custom ? customEnvUrls(custom) : EMPTY;
}

export function resolvedEnvPayload(
  name: EnvName,
  custom: CustomStack | null = null,
  allowed: boolean = CUSTOM_STACK_ALLOWED,
): ResolvedEnv {
  const urls = envUrls(name, allowed ? custom : null);
  return {
    name,
    backend: urls.backend,
    admin: urls.admin,
    supabaseUrl: urls.supabaseUrl,
    supabaseAnonKey: urls.supabaseAnonKey,
    redactFn: urls.redactFn,
    customStackAllowed: allowed,
    customStack: allowed ? custom : null,
  };
}

export type EnvChangeVerdict =
  | { kind: "refuse"; reason: "unknown_env" | "custom_not_allowed" | "custom_not_configured" }
  | { kind: "allow" | "needs-permission"; env: EnvName };

/**
 * The PURE decision behind the switch, outside Electron and outside disk — this is what we pin.
 * `allowed` is the server permission, already resolved by the caller (and already fail-closed).
 *
 * Toward `custom`: no server permission (the stack is the user's own, there's
 * no one else to ask), but TWO structural conditions — the build
 * honors it, and a valid stack is already written (by `env:set-custom-stack`, which passed
 * the native dialog). Returning to production is always permitted, wherever you come from.
 */
export function classifyEnvChange(args: {
  wanted: unknown;
  current: EnvName;
  allowed: boolean;
  customAllowed?: boolean;
  customConfigured?: boolean;
}): EnvChangeVerdict {
  if (!isEnvName(args.wanted)) return { kind: "refuse", reason: "unknown_env" };
  if (args.wanted === args.current) return { kind: "allow", env: args.wanted };
  if (args.wanted === "custom") {
    if (!(args.customAllowed ?? CUSTOM_STACK_ALLOWED)) return { kind: "refuse", reason: "custom_not_allowed" };
    if (!args.customConfigured) return { kind: "refuse", reason: "custom_not_configured" };
    return { kind: "allow", env: "custom" };
  }
  if (args.wanted === "production") return { kind: "allow", env: "production" };
  return { kind: args.allowed ? "allow" : "needs-permission", env: args.wanted };
}
