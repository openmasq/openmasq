/**
 * The SELF-HOSTED STACK — the third environment, `"custom"`, whose addresses are
 * NOT baked at build time but entered by the user (Settings → Versions).
 *
 * ⚠️ This is a DELIBERATE exception to `index.ts`'s "a name, never a URL" guard,
 * and it exists only in a build that requested it: `OPENMASQ_ALLOW_CUSTOM_STACK=1`
 * (`scripts/buildDefines.ts`). The official binary never sets this variable — a
 * `custom` pointer is read back there as production (`main/environment.ts`). A fork
 * that builds itself to be pointed at ITS OWN stack sets it, and accepts what that opens up:
 *
 * - What gets persisted is then indeed an address. What bounds it: **https
 *   mandatory** (http only to the local loopback — a plaintext token on a LAN
 *   is a read token), no credentials in the URL, no query or fragment; the
 *   Supabase pair go TOGETHER; validation lives HERE (pure, tested) and replays in
 *   MAIN on every write, never only in the screen (rule 7).
 * - Writing it requires a **NATIVE confirmation** (`dialog.showMessageBox`, in the
 *   privileged process) — which a compromised renderer can't click.
 * - The `custom` environment opens its **OWN** `userData` **profile** (`main/profile.ts`),
 *   like staging: a hijack would only reach an empty profile, never production's
 *   coffre and keys.
 * - The renderer's CSP is widened to ONLY the declared origins, by main, at load
 *   time (`main/customStackCsp.ts`) — never a wildcard.
 *
 * Accepted residual, stated here because it's true: in a build that allows it, a renderer
 * XSS can PROPOSE an address; it can't get it accepted without a human
 * click on a native dialog, and what it would get is a fresh profile.
 */
import type { EnvUrls } from "./index";

/** Does the build allow an entered stack? Baked at build time, never read at runtime. */
export const CUSTOM_STACK_ALLOWED: boolean = process.env.OPENMASQ_ALLOW_CUSTOM_STACK === "1";

export interface CustomStack {
  /** The API (`apps/backend`). Required — it's the whole point of the stack. */
  backend: string;
  /** The gateway (`apps/gateway`). Empty ⇒ neither cloud redaction nor included models. */
  gateway: string;
  /** The auth project (Supabase/GoTrue) and its PUBLISHABLE key — together or not at all. */
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

/**
 * Validate what arrives from the renderer (or from disk). Each field is trimmed; a missing
 * field counts as empty. Fail-closed: the slightest doubt is a named refusal, never an
 * "we'll see how it goes".
 */
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
  // The Supabase pair go TOGETHER: a URL without a key (or the reverse) is an auth that
  // fails halfway instead of not existing — the same rule as the baked table.
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

/** The ORIGINS to add to the renderer's `connect-src` — exactly the ones declared
 *  (+ `wss://` for Supabase realtime), never a wildcard. Deduplicated, ordered. */
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

/**
 * Widen the `connect-src` of `index.html`'s static CSP to the given origins.
 * Touches ONLY this directive, and only if it exists: a page with no CSP
 * receives nothing (it didn't need any), and no other directive moves.
 */
export function patchCspConnectSrc(html: string, origins: string[]): string {
  if (origins.length === 0) return html;
  return html.replace(/connect-src ([^;"]*)/, (_m, rest: string) => `connect-src ${rest.trim()} ${origins.join(" ")}`);
}
