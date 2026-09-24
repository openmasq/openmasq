import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { safeOpenExternal } from "../net/safeOpen";
import { setKey } from "./keys";
import type { ProviderId } from "@openmasq/llm";
import { BRAND } from "@openmasq/branding";

/**
 * "Connect my OpenRouter account" — OAuth PKCE, run ENTIRELY in main: the key is BORN here
 * and never crosses the IPC boundary (in `store/` because it feeds the secrets store, rule 10).
 *
 * ⚠️ PKCE is the mitigation, not a refinement: the deep-link callback can be intercepted by
 * any app registering the scheme, so an intercepted `code` is assumed and useless without
 * the in-memory, single-use, expiring `verifier`.
 *
 * The key belongs to the USER's account: their credits, their own free-model quota (which
 * OpenRouter governs per ACCOUNT).
 */

const AUTHORIZE_URL = "https://openrouter.ai/auth";
const EXCHANGE_URL = "https://openrouter.ai/api/v1/auth/keys";

/**
 * Where OpenRouter sends the user back. PRIMARY: a LOOPBACK listener (RFC 8252), which
 * belongs to THIS process (a custom scheme routes to ONE application, so an installed app
 * beside a dev instance steals the return). FALLBACK: the deep link, if the port won't open.
 */
export const CALLBACK_URL = `${BRAND.protocol}://openrouter/callback`;
const LOOPBACK_HOST = "127.0.0.1";
const LOOPBACK_PATH = "/callback";

/** Long enough to sign in, short enough that a stray callback can't complete an abandoned flow. */
const FLOW_TTL_MS = 5 * 60_000;

/** TYPED from the registry, so a rename is a red build here. */
const PROVIDER: ProviderId = "openrouter";

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/** A fresh PKCE pair (RFC 7636: 43-char verifier, S256 challenge). */
export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** The URL the user's browser opens to authorise. */
export function authorizeUrl(challenge: string, callbackUrl = CALLBACK_URL): string {
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("callback_url", callbackUrl);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

/** The `code` of a callback deep link, or null. Strict: any app-scheme URL an attacker gets
 *  the user to open reaches this. */
export function codeFromCallback(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== `${BRAND.protocol}:` || u.host !== "openrouter") return null;
    if (u.pathname !== "/callback" && u.pathname !== "/callback/") return null;
    const code = u.searchParams.get("code");
    return code && code.trim() ? code.trim() : null;
  } catch {
    return null;
  }
}

/** The single in-flight flow: two live verifiers would each accept a stray callback.
 *  `server` = this flow's loopback listener (absent on the deep-link fallback). */
let pending: { verifier: string; at: number; settle: (ok: boolean) => void; server?: Server } | null = null;

/** Drop the pending flow, resolving it as failed if it was still awaited. */
function abandon(): void {
  const p = pending;
  pending = null;
  p?.server?.close();
  p?.settle(false);
}

/** Listen is asynchronous: only the LATEST `begin` may set its flow. */
let flowSeq = 0;

/** Test seam: forget any in-flight flow — settled false, loopback listener freed. */
export function _resetOpenRouterFlow(): void {
  abandon();
}

/** Is there a live (non-expired) flow waiting for its callback? */
export function hasPendingFlow(now = Date.now()): boolean {
  if (!pending) return false;
  if (now - pending.at > FLOW_TTL_MS) {
    abandon();
    return false;
  }
  return true;
}

/** Static, param-free pages (NEVER an echo of the request — no reflection surface). */
const PAGE_OK =
  `<!doctype html><meta charset="utf-8"><title>${BRAND.name}</title><body style="font-family:sans-serif;padding:2rem">Autorisation reçue — vous pouvez fermer cet onglet et revenir dans ${BRAND.name}.</body>`;
const PAGE_MISS =
  `<!doctype html><meta charset="utf-8"><title>${BRAND.name}</title><body style="font-family:sans-serif;padding:2rem">Autorisation annulée ou incomplète — revenez dans ${BRAND.name} pour réessayer.</body>`;

/**
 * Start the flow: mint a pair, open a single-use LOOPBACK listener, send the browser to
 * OpenRouter, resolve on completion (true) or failure/expiry (false). No port ⇒ deep link.
 */
export function beginOpenRouterConnect(): Promise<boolean> {
  abandon(); // a new attempt supersedes an abandoned one
  const gen = ++flowSeq;
  const { verifier, challenge } = createPkcePair();
  return new Promise<boolean>((resolve) => {
    let done = false;
    const settle = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => {
      if (pending?.verifier === verifier) abandon();
      else settle(false);
    }, FLOW_TTL_MS);
    const launch = (callbackUrl: string, server?: Server) => {
      if (done || gen !== flowSeq) {
        // Settled or SUPERSEDED: no right to set a flow or open the browser.
        server?.close();
        settle(false);
        return;
      }
      if (!safeOpenExternal(authorizeUrl(challenge, callbackUrl))) {
        server?.close();
        settle(false);
        return;
      }
      abandon(); // one-verifier-only: any flow still set is older than us
      pending = { verifier, at: Date.now(), settle, server };
    };
    const server = createServer((req, res) => {
      const u = new URL(req.url ?? "/", `http://${LOOPBACK_HOST}`);
      if (req.method !== "GET" || u.pathname !== LOOPBACK_PATH) {
        res.writeHead(404, { Connection: "close" }).end();
        return;
      }
      const code = (u.searchParams.get("code") ?? "").trim();
      const live = !!code && pending?.verifier === verifier && hasPendingFlow();
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", Connection: "close" });
      res.end(live ? PAGE_OK : PAGE_MISS);
      if (!live) return;
      // Consume the flow FIRST (single-use), then exchange — like the deep-link leg.
      const flow = pending!;
      pending = null;
      server.close();
      void exchangeAndStore(code, flow.verifier).then((ok) => flow.settle(ok));
    });
    // A listener error ⇒ deep-link fallback, unless the browser is already pointed at it.
    server.on("error", () => {
      if (pending?.server === server) abandon();
      else launch(CALLBACK_URL);
    });
    server.listen(0, LOOPBACK_HOST, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        launch(CALLBACK_URL);
        return;
      }
      launch(`http://${LOOPBACK_HOST}:${addr.port}${LOOPBACK_PATH}`, server);
    });
  });
}

/** Complete the flow from a deep link; true only when a key was stored. The pending flow is
 *  consumed FIRST: a replayed callback must not get a second attempt. */
export async function completeOpenRouterConnect(url: string): Promise<boolean> {
  const code = codeFromCallback(url);
  if (!code || !hasPendingFlow()) {
    abandon();
    return false;
  }
  const flow = pending!;
  pending = null;
  flow.server?.close();
  const ok = await exchangeAndStore(code, flow.verifier);
  flow.settle(ok);
  return ok;
}

/** The shared tail of BOTH callback legs. */
async function exchangeAndStore(code: string, verifier: string): Promise<boolean> {
  try {
    const res = await fetch(EXCHANGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
        code_challenge_method: "S256",
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`OpenRouter PKCE exchange failed (${res.status})`);
    const body = (await res.json()) as { key?: unknown };
    const key = typeof body.key === "string" ? body.key.trim() : "";
    if (!key) throw new Error("OpenRouter PKCE exchange returned no key");
    await setKey(PROVIDER, key);
    return true;
  } catch (err) {
    // Never the code, the verifier or the key.
    console.warn(`[openrouter] connect failed: ${err instanceof Error ? err.message : "unknown"}`);
    return false;
  }
}
