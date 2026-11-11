import { assertPublicUrl, pinnedDispatcher } from "./net";

/**
 * A `fetch` for a client library that makes its OWN requests to hosts a semi-trusted server
 * names (a remote MCP server: its endpoint, then the OAuth discovery, registration and token
 * URLs its metadata points at). `assertPublicUrl` at connect time is not enough there: the
 * library re-resolves the name on every request, so a rebinding record turns the next one
 * into a request to loopback or the LAN, and the endpoints it discovers were never checked.
 *
 * Every request made through this function, and every redirect hop of it:
 *  - is https (nothing else leaves),
 *  - targets a host verified PUBLIC, the connection PINNED to the verified addresses,
 *  - follows a redirect only by hand, re-verified, and to ANOTHER origin with none of the
 *    caller's headers but a short harmless list (a bearer never follows a redirect out).
 * Fail closed: an unverifiable host, a missing pin or a body that cannot be replayed refuses.
 */

type Dispatcher = { close?: () => Promise<void> };
interface Pinned {
  dispatcher: Dispatcher;
  until: number;
}

/** How long one verification holds for a host. The pin makes the window safe (the socket
 *  goes to the VERIFIED address, whatever DNS says meanwhile); it only spares a lookup and
 *  a journal line per request of a chatty session. */
const VERIFIED_MS = 30_000;
const MAX_HOSTS = 32;
const MAX_REDIRECTS = 5;
/** What may follow a redirect to another origin. An ALLOW-list: a credential header a
 *  server invents tomorrow is dropped without anyone having to know its name. */
const CROSS_ORIGIN_HEADERS = new Set(["accept", "accept-language", "cache-control", "content-type", "pragma", "user-agent"]);

export interface PinnedFetchDeps {
  assertPublic: (url: string, source: string) => Promise<string[]>;
  pin: (addrs: string[]) => Promise<Dispatcher>;
  fetch: typeof fetch;
  now: () => number;
}

const replayable = (body: unknown): boolean =>
  body === undefined || body === null || typeof body === "string" || body instanceof Uint8Array || body instanceof ArrayBuffer || body instanceof URLSearchParams;

export function makePinnedFetch(source: string, deps: Partial<PinnedFetchDeps> = {}): typeof fetch {
  const d: PinnedFetchDeps = { assertPublic: assertPublicUrl, pin: pinnedDispatcher, fetch: (i, o) => fetch(i, o), now: Date.now, ...deps };
  const hosts = new Map<string, Pinned>();

  const drop = (host: string) => {
    const old = hosts.get(host);
    hosts.delete(host);
    // graceful: a stream still open on it ends on its own
    void old?.dispatcher.close?.().catch(() => {});
  };

  async function dispatcherFor(url: URL): Promise<Dispatcher> {
    if (url.protocol !== "https:") throw new Error(`Refused non-https URL: ${url.protocol}`);
    if (url.username || url.password) throw new Error("Refused URL with inline credentials");
    const kept = hosts.get(url.host);
    if (kept && kept.until > d.now()) return kept.dispatcher;
    if (kept) drop(url.host);
    const dispatcher = await d.pin(await d.assertPublic(url.toString(), source));
    if (hosts.size >= MAX_HOSTS) drop(hosts.keys().next().value as string);
    hosts.set(url.host, { dispatcher, until: d.now() + VERIFIED_MS });
    return dispatcher;
  }

  return async (input, init) => {
    // a Request carries its own body stream: taken apart so each hop is rebuilt from plain parts
    const first = input instanceof Request ? input : null;
    let url = new URL(first ? first.url : String(input));
    let method = (init?.method ?? first?.method ?? "GET").toUpperCase();
    let headers = new Headers(init?.headers ?? first?.headers);
    let body: BodyInit | null | undefined = init?.body ?? (first && method !== "GET" && method !== "HEAD" ? await first.arrayBuffer() : undefined);

    for (let hop = 0; ; hop++) {
      const dispatcher = await dispatcherFor(url);
      const res = await d.fetch(url, { ...init, method, headers, body, redirect: "manual", dispatcher } as RequestInit);
      const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!location) return res;
      await res.body?.cancel().catch(() => {});
      if (hop >= MAX_REDIRECTS) throw new Error("Too many redirects");
      const next = new URL(location, url);
      // 303 always, 301/302 for a POST: the browser rule, the body is not sent again
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
        method = "GET";
        body = undefined;
        headers.delete("content-type");
        headers.delete("content-length");
      } else if (!replayable(body)) {
        throw new Error("Refused redirect of a request whose body cannot be sent again");
      }
      if (next.origin !== url.origin) {
        const kept = new Headers();
        headers.forEach((value, name) => {
          if (CROSS_ORIGIN_HEADERS.has(name.toLowerCase())) kept.set(name, value);
        });
        headers = kept;
      }
      url = next;
    }
  };
}
