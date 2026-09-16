/**
 * The SELF-HOSTED STACK: the `"custom"` environment whose addresses are entered by the
 * user. A DELIBERATE exception to "a name, never a URL", existing only in a build that
 * set `OPENMASQ_ALLOW_CUSTOM_STACK=1` (the official binary reads a `custom` pointer as
 * production). What bounds it: https mandatory (http only on loopback), no credentials,
 * query or fragment, the auth pair TOGETHER, validation HERE (pure) and replayed in MAIN
 * on every write (rule 7); a NATIVE confirmation a renderer can't click; its OWN
 * `userData` profile (a hijack reaches an empty profile); the CSP widened to ONLY the
 * declared origins. RESIDUAL: an XSS can PROPOSE an address, never get it accepted.
 */
import type { EnvUrls } from "./index";

/** Does the build allow an entered stack? Baked at build time, never read at runtime. */
export const CUSTOM_STACK_ALLOWED: boolean = process.env.OPENMASQ_ALLOW_CUSTOM_STACK === "1";

export interface CustomStack {
  /** The API. Required: the whole point of the stack. */
  backend: string;
  /** The gateway. Empty ⇒ neither cloud redaction nor included models. */
  gateway: string;
  /** The auth project and its PUBLISHABLE key: together or not at all. */
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export type CustomStackRefusal =
  | "not_object"
  | "backend_required"
  | "not_absolute"
  | "not_https"
  | "userinfo"
  | "query_or_hash"
  | "supabase_pair";

export type CustomStackVerdict =
  | { ok: true; stack: CustomStack }
  | { ok: false; reason: CustomStackRefusal; field?: keyof CustomStack };

const URL_FIELDS = ["backend", "gateway", "supabaseUrl"] as const;

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** An acceptable service address, normalized (origin + path without a trailing `/`). */
function checkUrl(raw: string): { ok: true; url: string } | { ok: false; reason: CustomStackRefusal } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "not_absolute" };
  }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && LOOPBACK.has(u.hostname))) {
    return { ok: false, reason: "not_https" };
  }
  if (u.username || u.password) return { ok: false, reason: "userinfo" };
  if (u.search || u.hash) return { ok: false, reason: "query_or_hash" };
  return { ok: true, url: `${u.origin}${u.pathname.replace(/\/+$/, "")}` };
}

/** Validate what arrives from the renderer or from disk. Fail-closed: a named refusal. */
export function validateCustomStack(raw: unknown): CustomStackVerdict {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not_object" };
  const r = raw as Record<string, unknown>;
  const str = (k: keyof CustomStack): string => (typeof r[k] === "string" ? (r[k] as string).trim() : "");
  const out: CustomStack = {
    backend: str("backend"),
    gateway: str("gateway"),
    supabaseUrl: str("supabaseUrl"),
    supabaseAnonKey: str("supabaseAnonKey"),
  };
  if (!out.backend) return { ok: false, reason: "backend_required", field: "backend" };
  for (const field of URL_FIELDS) {
    if (!out[field]) continue;
    const v = checkUrl(out[field]);
    if (!v.ok) return { ok: false, reason: v.reason, field };
    out[field] = v.url;
  }
  // The auth pair go TOGETHER: half a pair is an auth that fails halfway.
  if (!!out.supabaseUrl !== !!out.supabaseAnonKey) {
    return { ok: false, reason: "supabase_pair", field: out.supabaseUrl ? "supabaseAnonKey" : "supabaseUrl" };
  }
  return { ok: true, stack: out };
}

/** The address table of an entered stack — the same shape as `ENVIRONMENTS[name]`. */
export function customEnvUrls(stack: CustomStack): EnvUrls {
  return {
    backend: stack.backend,
    admin: stack.backend ? `${stack.backend}/admin` : "",
    supabaseUrl: stack.supabaseUrl,
    supabaseAnonKey: stack.supabaseAnonKey,
    redactFn: stack.gateway,
  };
}

/** The ORIGINS for the renderer's `connect-src`: exactly the declared ones (+ `wss://` for
 *  auth realtime), never a wildcard. */
export function customCspOrigins(stack: CustomStack): string[] {
  const out = new Set<string>();
  for (const raw of [stack.backend, stack.gateway, stack.supabaseUrl]) {
    if (!raw) continue;
    try {
      out.add(new URL(raw).origin);
    } catch {
      /* already refused by validateCustomStack; nothing gets widened here on a doubt */
    }
  }
  if (stack.supabaseUrl) {
    try {
      const u = new URL(stack.supabaseUrl);
      out.add(`${u.protocol === "http:" ? "ws" : "wss"}://${u.host}`);
    } catch {
      /* same */
    }
  }
  return [...out];
}

/** Widen ONLY the `connect-src` directive of the static CSP, and only if it exists. */
export function patchCspConnectSrc(html: string, origins: string[]): string {
  if (origins.length === 0) return html;
  return html.replace(/connect-src ([^;"]*)/, (_m, rest: string) => `connect-src ${rest.trim()} ${origins.join(" ")}`);
}
