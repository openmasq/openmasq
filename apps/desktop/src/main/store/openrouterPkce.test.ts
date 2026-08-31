import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHash } from "node:crypto";
import { BRAND } from "@openmasq/branding";

// The flow opens the OS browser and writes to the keychain — both stubbed, so the test
// exercises the DECISIONS (what is accepted, what is consumed) and never the platform.
const opened: string[] = [];
const stored: [string, string][] = [];
vi.mock("../net/safeOpen", () => ({
  safeOpenExternal: (url: string) => {
    opened.push(url);
    return true;
  },
}));
vi.mock("./keys", () => ({ setKey: async (id: string, v: string) => void stored.push([id, v]) }));

const {
  authorizeUrl,
  beginOpenRouterConnect,
  codeFromCallback,
  completeOpenRouterConnect,
  createPkcePair,
  hasPendingFlow,
  _resetOpenRouterFlow,
  CALLBACK_URL,
} = await import("./openrouterPkce");

beforeEach(() => {
  opened.length = 0;
  stored.length = 0;
  _resetOpenRouterFlow();
  vi.unstubAllGlobals();
});

/** A fetch stub that answers the exchange with `body` — and PASSES THROUGH any
 *  loopback (127.0.0.1) request to the real fetch, so the callback listener stays
 *  reachable from the test itself. */
function stubExchange(body: unknown, ok = true) {
  const calls: { url: string; body: unknown }[] = [];
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
    if (String(url).startsWith("http://127.0.0.1")) return realFetch(url, init as RequestInit);
    calls.push({ url: String(url), body: JSON.parse(init?.body ?? "null") });
    return { ok, status: ok ? 200 : 400, json: async () => body } as Response;
  });
  return calls;
}

const flushIo = () => new Promise<void>((r) => setImmediate(r));

/** Begin a flow and wait until its (async) loopback listener has posed it.
 *  ⚠️ Returns the WRAPPED promise: `await` on a Promise<Promise<…>> flattens the
 *  two levels and would wait for the flow's END — the deadlock this helper avoided. */
async function begun(): Promise<{ done: Promise<boolean> }> {
  const done = beginOpenRouterConnect();
  for (let i = 0; i < 100 && !hasPendingFlow(); i++) await flushIo();
  expect(hasPendingFlow()).toBe(true);
  return { done };
}

/** The callback_url the flow just handed to the browser (from the authorize URL). */
function launchedCallback(): string {
  const u = new URL(opened[opened.length - 1]);
  return u.searchParams.get("callback_url")!;
}

describe("PKCE pair — the secret never travels", () => {
  it("the challenge is the SHA-256 of the verifier, base64url", () => {
    const { verifier, challenge } = createPkcePair();
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });

  it("the verifier meets RFC 7636 (43–128 url-safe chars) and is never reused", () => {
    const a = createPkcePair();
    const b = createPkcePair();
    expect(a.verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    expect(a.verifier).not.toBe(b.verifier);
  });

  it("the authorize URL carries the CHALLENGE, never the verifier", () => {
    const { verifier, challenge } = createPkcePair();
    const u = new URL(authorizeUrl(challenge));
    expect(u.origin + u.pathname).toBe("https://openrouter.ai/auth");
    expect(u.searchParams.get("code_challenge")).toBe(challenge);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("callback_url")).toBe(CALLBACK_URL);
    expect(u.toString()).not.toContain(verifier);
  });
});

describe("codeFromCallback — any app can open an app-scheme URL", () => {
  it("accepts our own callback", () => {
    expect(codeFromCallback(`${BRAND.protocol}://openrouter/callback?code=abc`)).toBe("abc");
  });

  it("drops another scheme, host or path", () => {
    expect(codeFromCallback("https://openrouter/callback?code=abc")).toBeNull();
    expect(codeFromCallback(`${BRAND.protocol}://auth/callback?code=abc`)).toBeNull();
    expect(codeFromCallback(`${BRAND.protocol}://openrouter/evil?code=abc`)).toBeNull();
    expect(codeFromCallback("pas une url")).toBeNull();
  });

  it("drops a callback with no usable code", () => {
    expect(codeFromCallback(`${BRAND.protocol}://openrouter/callback`)).toBeNull();
    expect(codeFromCallback(`${BRAND.protocol}://openrouter/callback?code=%20`)).toBeNull();
  });
});

describe("boucle locale — le retour recommandé (RFC 8252), sans course de scheme", () => {
  it("le navigateur reçoit un callback 127.0.0.1 ; le GET /callback complète le flux", async () => {
    const calls = stubExchange({ key: "sk-or-v1-loop" });
    const { done } = await begun();
    const cb = launchedCallback();
    expect(cb).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    const res = await fetch(`${cb}?code=c9`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(`revenir dans ${BRAND.name}`);
    await expect(done).resolves.toBe(true);
    expect(stored).toEqual([["openrouter", "sk-or-v1-loop"]]);
    const sent = calls[0].body as { code: string; code_verifier: string };
    expect(sent.code).toBe("c9");
    expect(opened[0]).not.toContain(sent.code_verifier); // the verifier never travels
  });

  it("un GET hors /callback fait 404 et ne consomme rien ; sans code, page d'échec et flux intact", async () => {
    stubExchange({ key: "k" });
    const { done } = await begun();
    const cb = launchedCallback();
    const notFound = await fetch(cb.replace("/callback", "/evil?code=c9"));
    expect(notFound.status).toBe(404);
    expect(hasPendingFlow()).toBe(true);
    const missing = await fetch(cb);
    expect(missing.status).toBe(200);
    expect(await missing.text()).toContain("réessayer");
    expect(hasPendingFlow()).toBe(true); // cancellation ≠ consumption: one can retry
    _resetOpenRouterFlow();
    await expect(done).resolves.toBe(false);
  });

  it("le listener est SINGLE-USE : après le premier code, le port est fermé", async () => {
    stubExchange({ key: "k" });
    const { done } = await begun();
    const cb = launchedCallback();
    await fetch(`${cb}?code=c1`);
    await expect(done).resolves.toBe(true);
    await expect(fetch(`${cb}?code=c2`)).rejects.toThrow(); // connection refused
    expect(stored).toHaveLength(1);
  });
});

describe("the flow is single-use and bound to ITS verifier (jambe deep link)", () => {
  it("stores the key the exchange returns, under `openrouter`", async () => {
    const calls = stubExchange({ key: "sk-or-v1-xyz" });
    const { done } = await begun();
    expect(opened[0]).toContain("code_challenge_method=S256");
    await expect(completeOpenRouterConnect(`${BRAND.protocol}://openrouter/callback?code=c1`)).resolves.toBe(true);
    await expect(done).resolves.toBe(true);
    expect(stored).toEqual([["openrouter", "sk-or-v1-xyz"]]);
    // The exchange sends the VERIFIER — the half that never went to the browser.
    const sent = calls[0].body as { code: string; code_verifier: string };
    expect(sent.code).toBe("c1");
    expect(opened[0]).not.toContain(sent.code_verifier);
  });

  it("a REPLAYED callback finds no flow — the verifier is consumed, not left armed", async () => {
    stubExchange({ key: "sk-or-v1-xyz" });
    const { done } = await begun();
    await completeOpenRouterConnect(`${BRAND.protocol}://openrouter/callback?code=c1`);
    await done;
    stored.length = 0;
    await expect(completeOpenRouterConnect(`${BRAND.protocol}://openrouter/callback?code=c1`)).resolves.toBe(false);
    expect(stored).toEqual([]);
  });

  it("a callback with NO flow in flight is refused (an unsolicited deep link)", async () => {
    stubExchange({ key: "sk-or-v1-xyz" });
    await expect(completeOpenRouterConnect(`${BRAND.protocol}://openrouter/callback?code=c1`)).resolves.toBe(false);
    expect(stored).toEqual([]);
  });

  it("a MALFORMED callback consumes the flow rather than leaving it armed", async () => {
    stubExchange({ key: "sk-or-v1-xyz" });
    const { done } = await begun();
    await completeOpenRouterConnect(`${BRAND.protocol}://evil/callback?code=c1`);
    expect(hasPendingFlow()).toBe(false);
    await expect(done).resolves.toBe(false);
  });

  it("a second attempt supersedes the first — never two live verifiers", async () => {
    stubExchange({ key: "k" });
    const { done: first } = await begun();
    const { done: second } = await begun();
    await expect(first).resolves.toBe(false); // the abandoned one resolves, it does not hang
    expect(hasPendingFlow()).toBe(true); // …and the SECOND flow is the live one
    _resetOpenRouterFlow();
    await expect(second).resolves.toBe(false);
  });

  it("an expired flow is dead — a late callback cannot complete it", async () => {
    stubExchange({ key: "k" });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { done } = await begun();
    vi.advanceTimersByTime(6 * 60_000);
    await expect(completeOpenRouterConnect(`${BRAND.protocol}://openrouter/callback?code=c1`)).resolves.toBe(false);
    await expect(done).resolves.toBe(false);
    expect(stored).toEqual([]);
    vi.useRealTimers();
  });
});

describe("failures are failures — never a stored non-key", () => {
  it("a non-2xx exchange stores nothing", async () => {
    stubExchange({ error: "bad_code" }, false);
    const { done } = await begun();
    await expect(completeOpenRouterConnect(`${BRAND.protocol}://openrouter/callback?code=c1`)).resolves.toBe(false);
    await expect(done).resolves.toBe(false);
    expect(stored).toEqual([]);
  });

  it("a 200 with no key stores nothing (an empty string is not a credential)", async () => {
    stubExchange({ key: "   " });
    const { done } = await begun();
    await expect(completeOpenRouterConnect(`${BRAND.protocol}://openrouter/callback?code=c1`)).resolves.toBe(false);
    await expect(done).resolves.toBe(false);
    expect(stored).toEqual([]);
  });
});
