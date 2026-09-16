import { isLocalOrPrivateEndpoint } from "./providerHostPolicy";

/**
 * SECURITY — WHERE a chat completion may be POSTed. The renderer hands `withKey` a
 * `baseUrl`; this is the floor on it, like every other egress sink has one.
 *
 * ## The two legitimate values, and nothing else
 * Every send path in `@openmasq/ui` computes the SAME expression: the platform gateway,
 * carried WITH a renderer-supplied JWT (always set together), or the user's own
 * OpenAI-compatible endpoint; otherwise `undefined`. So the rules below are an ALLOW-list of
 * what actually happens: a MAIN-INJECTED key never follows a renderer-chosen endpoint, for
 * ANY provider id (a list of ids to strip would miss the one nobody thought of, and ship the
 * stored key to an attacker's host in an `Authorization` header). Root rule 7.
 *
 * ## Why the private-endpoint rule is gated on `packaged`
 * In dev the gateway is a localhost URL. A packaged build's baked gateway is public HTTPS,
 * so the private branch is unreachable in any legitimate shipped run: refusing it is free.
 *
 * ## What this does NOT close (stated, not implied)
 * On the platform path the `baseUrl` is trusted BY SHAPE, not by value: a renderer XSS can
 * still post to an arbitrary PUBLIC host as a platform send. Closing that needs main to know
 * the gateway origin itself (a build-config change). Two sibling channels share the residual
 * and are ACCEPTED for the same reason (an attacker who can call them already has this one):
 * `web:fetch-many` and `embeddings:index`/`:search` let a renderer choose a public host;
 * both go through `safeFetch`, so an internal address is refused. Constraining them would
 * refuse a URL the user typed, or a self-hosted embedder, for no capability the attacker
 * loses. The host check here is a literal/`localhost` classification with no DNS resolution
 * (hot send path, fixed gateway host); `assertPublicUrl` is the tool if that ever matters.
 */

/** What a provider call may keep. `undefined` on either field means "send without it": no
 *  `baseUrl` ⇒ the provider's canonical host, no `apiKey` ⇒ unauthenticated (fail closed). */
export interface EndpointDecision {
  baseUrl?: string;
  apiKey?: string;
  /** Why something was dropped, for a log line. Never carries a key or a full URL. */
  warn?: string;
}

/** http(s) only. A `file:`/`data:`/custom scheme is never a completion endpoint, and it is
 *  the cheapest thing to get wrong; an unparseable URL counts as refused. */
function isHttpUrl(url: string): boolean {
  try {
    const p = new URL(url).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}

/**
 * Decide the `(baseUrl, apiKey)` a provider call may actually use.
 *
 * `rendererSuppliedKey` is the discriminator the whole policy turns on: a key that came from
 * the RENDERER is the platform JWT (or a BYO key the user pasted for this call), so it may
 * follow the renderer's endpoint. A key `withKey` pulled out of the encrypted store must
 * never do so — that is key exfiltration, whatever the provider id.
 */
export function decideProviderEndpoint(
  call: { provider: string; apiKey?: string; baseUrl?: string },
  opts: { rendererSuppliedKey: boolean; packaged: boolean },
): EndpointDecision {
  const { provider, apiKey, baseUrl } = call;
  // No override: the provider uses its canonical host. Nothing to decide.
  if (!baseUrl) return { baseUrl, apiKey };

  if (!isHttpUrl(baseUrl)) {
    return { baseUrl: undefined, apiKey, warn: `${provider}: non-http(s) baseUrl dropped` };
  }

  // `openai-compat` is DEFINED by its custom endpoint, so the override stands. Its
  // main-injected key stays pinned to a loopback/private target: a public host gets the
  // request without the key.
  if (provider === "openai-compat") {
    if (!opts.rendererSuppliedKey && apiKey && !isLocalOrPrivateEndpoint(baseUrl)) {
      return {
        baseUrl,
        apiKey: undefined,
        warn: "openai-compat: stored key NOT sent to a non-local endpoint (audit M5)",
      };
    }
    return { baseUrl, apiKey };
  }

  // Every other provider: a MAIN-INJECTED key never rides a renderer-chosen endpoint.
  if (!opts.rendererSuppliedKey && apiKey) {
    return { baseUrl: undefined, apiKey, warn: `${provider}: stored key pinned to its canonical host` };
  }

  // Renderer-supplied key ⇒ the platform gateway. PACKAGED ⇒ its URL is public HTTPS, so
  // an internal target is never legitimate: refuse rather than silently retarget (posting
  // the JWT at the provider's real host would read as an auth bug).
  if (opts.packaged && isLocalOrPrivateEndpoint(baseUrl)) {
    throw new Error("Endpoint refusé : adresse interne/privée pour un modèle de plateforme.");
  }
  return { baseUrl, apiKey };
}
