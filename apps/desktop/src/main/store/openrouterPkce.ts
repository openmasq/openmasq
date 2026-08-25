import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { safeOpenExternal } from "../net/safeOpen";
import { setKey } from "./keys";
import type { ProviderId } from "@openmasq/llm";
import { BRAND } from "@openmasq/branding";

/**
 * « Connecter mon compte OpenRouter » — OAuth PKCE, run ENTIRELY in main.
 *
 * Why it lives in `store/`: it MINTS a provider key and writes it to the encrypted
 * keychain, so it belongs to the secrets family (root rule 10 — the flow sits next to
 * the store it feeds). And why it runs in main rather than the renderer: the key is
 * BORN here and never crosses the IPC boundary. That is strictly better than the paste
 * path, where the renderer necessarily sees the key once before `keys:set` — and it is
 * why there is no `keys:get` to undo it.
 *
 * ⚠️ PKCE is not a refinement here, it is the mitigation. The callback comes back over
 * the app's custom URL scheme, which ANY other application on the machine can also
 * register. An intercepted `code` is therefore assumed, and useless without the
 * `verifier` — which is generated here, kept in memory only, single-use, and expires.
 *
 * The key obtained belongs to the USER's OpenRouter account: their credits, their free-
 * model quota. That is the whole point — OpenRouter governs free-model rate limits per
 * ACCOUNT ("making additional accounts or API keys will not affect your rate limits"),
 * so a key minted under the app's own account would hand the user a slice of ONE shared
 * bucket, not a quota of their own.
 */

const AUTHORIZE_URL = "https://openrouter.ai/auth";
const EXCHANGE_URL = "https://openrouter.ai/api/v1/auth/keys";

/**
 * Where OpenRouter sends the user back.
 *
 * PRIMARY : une BOUCLE LOCALE `http://127.0.0.1:<port éphémère>/callback` (RFC 8252, le
 * retour recommandé pour une app native). Le deep link du scheme custom était le maillon qui
 * cassait : LaunchServices ne route un scheme custom que vers UNE application — avec une
 * app installée à côté de l'instance de dev (ou l'inverse), le retour partait dans
 * l'autre app et le flux attendait pour rien (journal 02/08). Le socket loopback, lui,
 * appartient à CE processus : pas de course d'enregistrement, pas d'interception par une
 * app tierce (déjà mieux que le scheme, que n'importe qui peut enregistrer) — et PKCE
 * reste la ceinture : un code intercepté est inutile sans le verifier en mémoire.
 *
 * FALLBACK : si le port ne s'ouvre pas, l'ancien deep link reprend — comportement
 * d'avant, rien ne régresse.
 */
export const CALLBACK_URL = `${BRAND.protocol}://openrouter/callback`;
const LOOPBACK_HOST = "127.0.0.1";
const LOOPBACK_PATH = "/callback";

/** How long a started flow stays valid. Long enough to sign in and authorise, short
 *  enough that an abandoned flow cannot be completed by a later stray callback. */
const FLOW_TTL_MS = 5 * 60_000;

/** The provider id the key is stored under. TYPED from the registry rather than described
 *  by a comment: a rename in `@openmasq/llm` is then a red build here, not a stale note. */
const PROVIDER: ProviderId = "openrouter";

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/**
 * A fresh PKCE pair. The verifier is 32 random bytes base64url-encoded (43 chars — the
 * RFC 7636 floor is 43, the ceiling 128), and the challenge is its SHA-256, so the
 * value on the wire proves knowledge of a secret it does not reveal.
 */
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

/**
 * The `code` carried by a callback deep link, or null.
 *
 * Strict on the shape: this is reachable by any app-scheme URL an attacker can get the
 * user to open, so an unexpected host/path is dropped rather than parsed leniently.
 */
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

/** The single in-flight flow. One at a time on purpose: a second « Connecter » click
 *  must not leave two verifiers alive, either of which a stray callback could complete.
 *  `server` = the loopback listener of THIS flow (absent on the deep-link fallback);
 *  it lives exactly as long as the flow. */
let pending: { verifier: string; at: number; settle: (ok: boolean) => void; server?: Server } | null = null;

/** Drop the pending flow, resolving it as failed if it was still awaited. */
function abandon(): void {
  const p = pending;
  pending = null;
  p?.server?.close();
  p?.settle(false);
}

/** Monotonic flow generation : le listen étant asynchrone, seul le DERNIER `begin`
 *  a le droit de poser son flow — un launch d'une génération dépassée se ferme. */
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
 * OpenRouter with that listener as `callback_url`, and resolve when the callback
 * completes (true) or the flow fails/expires (false). If the loopback port cannot be
 * opened, the app-scheme deep-link callback takes over (previous behaviour) — the flow
 * degrades, it never breaks harder than before.
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
        // Réglé (Stop/TTL) ou SUPERSÉDÉ par un `begin` plus récent : ce launch n'a
        // plus le droit de poser un flow ni d'ouvrir le navigateur.
        server?.close();
        settle(false);
        return;
      }
      if (!safeOpenExternal(authorizeUrl(challenge, callbackUrl))) {
        server?.close();
        settle(false);
        return;
      }
      abandon(); // un-seul-verifier : tout flow encore posé est plus vieux que nous
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
    // Any listener/socket error ⇒ deep-link fallback (unless already launched: `pending`
    // still holding this server means the browser is already pointed at it — abandon).
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

/**
 * Complete the flow from a callback deep link: exchange `code` + the in-memory verifier
 * for the user's key and store it encrypted. Returns true only when a key was stored.
 *
 * The pending flow is consumed FIRST, whatever happens next: a code is single-use, and
 * leaving the verifier alive after one attempt would let a replayed callback try again.
 */
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

/** Exchange `code` + `verifier` for the user's key and store it encrypted — the shared
 *  tail of BOTH callback legs (loopback + deep link). */
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
    // Never log the code, the verifier or the key — only that it failed, and why in
    // shape terms. The user sees an honest failure and can retry.
    console.warn(`[openrouter] connect failed: ${err instanceof Error ? err.message : "unknown"}`);
    return false;
  }
}
