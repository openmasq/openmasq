/**
 * `fetch` for our first-party Vercel backend (`app.<domaine> / staging.<domaine>`,
 * `/api-features/*`).
 *
 * The STAGING web deployment sits behind **Vercel Deployment Protection** (Vercel
 * Authentication) — a shipped desktop app can't complete the SSO, so every backend
 * request would 302 → `vercel.com/sso-api` → 401. The staging BUILD bakes the
 * project's automation-bypass secret into `VITE_BACKEND_BYPASS`, and this wrapper
 * sends it as `x-vercel-protection-bypass` so the request reaches the function.
 *
 * Production is NOT protected, so its build leaves `VITE_BACKEND_BYPASS` empty and
 * the header is omitted (plain `fetch`). Only used for the Vercel backend (billing +
 * sync); the Scaleway redact/inference container is a different origin, unprotected.
 */
import { BACKEND_BYPASS, APP_VERSION } from "./appEnv";
import { CLIENT_HEADER, clientIdentityHeader } from "../../clientIdentity";

const BYPASS = BACKEND_BYPASS;

/** True when a staging bypass secret was baked in — i.e. the backend is protected. */
export const BACKEND_BYPASS_ENABLED = !!BYPASS;

/**
 * ⚠️ CE helper, et pas `fetch`, pour TOUT appel à notre backend — c'est ce qui rend
 * l'identité du client universelle plutôt que « posée aux endroits auxquels on a pensé ».
 * Le backend s'en sert pour savoir qu'une connexion vient de l'app de bureau (et non du
 * site ou d'une console), ce qui décide notamment de l'enrôlement dans la liste de
 * diffusion : `clientIdentity.ts` dit pourquoi ce n'est PAS une frontière de sécurité.
 */
export function backendFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set(CLIENT_HEADER, clientIdentityHeader(APP_VERSION));
  if (BYPASS) headers.set("x-vercel-protection-bypass", BYPASS);
  return fetch(input, { ...init, headers });
}
