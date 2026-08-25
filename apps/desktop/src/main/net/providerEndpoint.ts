import { isLocalOrPrivateEndpoint } from "./providerHostPolicy";

/**
 * SECURITY (audit H1) — WHERE a chat completion is allowed to be POSTed.
 *
 * `chat:*` was the one main-process egress sink with no floor on its URL at all. The
 * renderer hands `withKey` a `baseUrl`, `@openmasq/llm` does
 * `fetch(`${baseUrl}/chat/completions`)`, and nothing in between checked the scheme, the
 * host, or who supplied the key. Every OTHER outbound path in this process has a floor
 * (`assertPublicUrl` for the browser's navigate, a connector's hop 0, the embeddings POST
 * and `safeFetch`); this one had none, so a renderer XSS could POST the conversation to any
 * host it liked and reach internal addresses from the privileged process.
 *
 * ## The two legitimate values, and nothing else
 *
 * All three send paths in `@openmasq/ui` (`state/store.ts`, plus `send/routing.ts` for the
 * out-of-band completion) compute the SAME expression:
 *
 *     baseUrl = platform ? host.inferenceUrl                     // the baked gateway
 *             : provider === "openai-compat" ? settings.openaiCompatBaseUrl
 *             : undefined
 *
 * So a `baseUrl` is only ever (1) the platform gateway, carried WITH a renderer-supplied Supabase
 * JWT — the two are set together, always — or (2) the user's own OpenAI-compatible endpoint.
 * For every other combination it is `undefined`. That makes the rules below an ALLOW-list of
 * what actually happens rather than a deny-list of what we thought to forbid, which is the
 * bug the previous shape had: `CANONICAL_HOST_PROVIDERS` enumerated the providers whose
 * override to DROP, so any id missing from it — `scaleway`, or any future one — kept the
 * renderer's `baseUrl` while `withKey` attached a MAIN-INJECTED key. A `chat:complete` on
 * `{provider:"scaleway", baseUrl:"https://attacker/v1"}` therefore shipped the stored
 * `redactModel` key to the attacker in an `Authorization` header: the exact H-2 hole, through
 * the one door the list forgot. Root rule 7: allow-list, never deny-list.
 *
 * ## Why the private-endpoint rule is gated on `packaged`
 *
 * The gateway is a BUILD-BAKED URL, and in dev it is `http://localhost:8080`
 * (`apps/desktop/.env.development`). A blanket "public hosts only" would refuse every
 * platform send in `pnpm dev`. A packaged build's baked gateway is public HTTPS, so the
 * private branch is unreachable in any legitimate shipped run — which is what makes refusing
 * it there free.
 *
 * ## What this does NOT close (stated, not implied)
 *
 * On the platform path the `baseUrl` is still trusted BY SHAPE, not by value: a renderer XSS
 * can still post to an arbitrary PUBLIC host by presenting itself as a platform send. Closing
 * that needs main to know the gateway origin itself — i.e. baking `VITE_REDACT_FN_URL` into
 * the main bundle's `define` (and into turbo's cache key, cf. `c50a0a66`) and comparing
 * origins here. That is a build-config change, so it is deliberately NOT in this one.
 * Likewise, the host check is a literal/`localhost` classification with no DNS resolution:
 * it is on the hot send path, and the gateway is a fixed host. A name resolving to a private
 * address is not caught here — `assertPublicUrl` is the tool if that ever becomes reachable.
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

  // `openai-compat` is DEFINED by its custom endpoint (Ollama / LM Studio / a LAN box), so
  // the override always stands. Its main-injected key stays pinned to a loopback/private
  // target (audit M5) — a public host gets the request without the key, never the key.
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

  // Every other provider. A MAIN-INJECTED key never rides a renderer-chosen endpoint —
  // universal, so a provider id nobody thought of is covered by default (audit H1/H-2).
  if (!opts.rendererSuppliedKey && apiKey) {
    return { baseUrl: undefined, apiKey, warn: `${provider}: stored key pinned to its canonical host` };
  }

  // Renderer-supplied key ⇒ the platform gateway. In a PACKAGED build its baked URL is
  // public HTTPS, so an internal/LAN/metadata target is never legitimate: refuse rather
  // than silently retarget (dropping the baseUrl would post a Supabase JWT at the
  // provider's real host and answer 401, which reads as an auth bug, not a refusal).
  if (opts.packaged && isLocalOrPrivateEndpoint(baseUrl)) {
    throw new Error("Endpoint refusé : adresse interne/privée pour un modèle de plateforme.");
  }
  return { baseUrl, apiKey };
}
