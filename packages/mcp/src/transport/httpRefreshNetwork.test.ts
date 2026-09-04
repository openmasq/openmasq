// The REAL SDK, a stubbed network: what a silent reconnect gets back when the token
// refresh never reaches the authorization server (a laptop waking up on no network),
// versus when the server itself refuses the refresh token. The SDK turns BOTH into
// « start a new authorization »; only `networkError` tells them apart.
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpMcpServer } from "./http";
import { makeOAuthProvider } from "./oauth";

const SERVER = "https://mcp.example/";
const AS = "https://as.example/";
const REDIRECT = "http://127.0.0.1:1/cb";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** An OAuth-protected MCP server whose token endpoint behaves as `onToken` says. */
function fakeNetwork(onToken: () => Response | Promise<Response>): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = init?.method ?? "GET";
    if (url === SERVER && method === "POST") {
      return new Response("unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": `Bearer resource_metadata="${SERVER}.well-known/oauth-protected-resource"` },
      });
    }
    if (url.includes("/.well-known/oauth-protected-resource")) {
      return json({ resource: SERVER, authorization_servers: [AS] });
    }
    if (url.includes("/.well-known/oauth-authorization-server")) {
      return json({
        issuer: AS,
        authorization_endpoint: `${AS}authorize`,
        token_endpoint: `${AS}token`,
        response_types_supported: ["code"],
        code_challenge_methods_supported: ["S256"],
        grant_types_supported: ["authorization_code", "refresh_token"],
      });
    }
    if (url === `${AS}token`) return onToken();
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

function server(opened: URL[] = []) {
  const provider = makeOAuthProvider({
    redirectUrl: REDIRECT,
    clientName: "t",
    state: {
      clientInformation: { client_id: "cid", redirect_uris: [REDIRECT] },
      tokens: { access_token: "stale", refresh_token: "r", token_type: "bearer" },
    },
    persist: () => {},
    openAuthorization: (url) => {
      opened.push(url);
    },
  });
  return new HttpMcpServer({ id: "x", url: SERVER, authProvider: provider });
}

afterEach(() => vi.unstubAllGlobals());

describe("HttpMcpServer.connect — a refresh the network swallowed", () => {
  it("rend non autorisé AVEC la cause réseau, le socket compris", async () => {
    vi.stubGlobal(
      "fetch",
      fakeNetwork(() => {
        throw new TypeError("fetch failed", { cause: { code: "EHOSTUNREACH" } });
      }),
    );
    const opened: URL[] = [];
    const out = await server(opened).connect();
    expect(out).toEqual({ authorized: false, networkError: "fetch failed (EHOSTUNREACH)" });
    // The SDK still asked for a new authorization — that is the behaviour the flag corrects.
    expect(opened).toHaveLength(1);
  });

  it("un refresh REFUSÉ par le serveur remonte en erreur OAuth, jamais en cause réseau", async () => {
    // A bare `{error}` (no description) is legal: the SDK's error then has an EMPTY
    // message and only `errorCode` says why — `connectRemote.ts` falls back to it.
    vi.stubGlobal("fetch", fakeNetwork(() => json({ error: "invalid_grant" }, 400)));
    await expect(server().connect()).rejects.toMatchObject({ errorCode: "invalid_grant" });
  });

  it("la cause réseau ne survit pas à un connect() suivant", async () => {
    let fail = true;
    vi.stubGlobal(
      "fetch",
      fakeNetwork(() => {
        if (fail) throw new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } });
        return json({ access_token: "fresh", token_type: "bearer", refresh_token: "r2", expires_in: 3600 });
      }),
    );
    const s = server();
    expect((await s.connect()).authorized).toBe(false);
    fail = false;
    // Second attempt: the refresh now answers; the SDK retries the POST with the new
    // bearer — our fake still answers 401, so it ends unauthorized, but with NO
    // network cause left over from the first attempt.
    const out = await s.connect().catch((e: Error) => e);
    if (out instanceof Error) expect(out.message).not.toMatch(/ENOTFOUND/);
    else expect(out).not.toHaveProperty("networkError");
  });
});
