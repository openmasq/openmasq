import { describe, expect, it, vi } from "vitest";
import { makeOAuthProvider, type StoredOAuthState } from "./oauth";

describe("makeOAuthProvider", () => {
  const base = () => {
    let saved: StoredOAuthState | undefined;
    const persist = vi.fn((s: StoredOAuthState) => {
      saved = s;
    });
    const openAuthorization = vi.fn();
    const provider = makeOAuthProvider({
      redirectUrl: "http://127.0.0.1:42813/callback",
      clientName: "openmasq (Notion)",
      scope: "read",
      persist,
      openAuthorization,
    });
    return { provider, persist, openAuthorization, saved: () => saved };
  };

  it("exposes redirect URL and DCR-ready client metadata", () => {
    const { provider } = base();
    expect(provider.redirectUrl).toBe("http://127.0.0.1:42813/callback");
    const meta = provider.clientMetadata;
    expect(meta.redirect_uris).toEqual(["http://127.0.0.1:42813/callback"]);
    expect(meta.grant_types).toContain("refresh_token");
    expect(meta.response_types).toEqual(["code"]);
    expect(meta.token_endpoint_auth_method).toBe("none");
    expect(meta.scope).toBe("read");
  });

  it("persists tokens, client info and PKCE verifier on every change", async () => {
    const { provider, persist, saved } = base();
    await provider.saveCodeVerifier("verifier-123");
    expect(provider.codeVerifier()).toBe("verifier-123");

    await provider.saveClientInformation!({
      client_id: "cid",
      redirect_uris: ["http://127.0.0.1:42813/callback"],
    });
    await provider.saveTokens({ access_token: "at", token_type: "bearer" });

    expect((await provider.tokens())?.access_token).toBe("at");
    expect((await provider.clientInformation())?.client_id).toBe("cid");
    expect(persist).toHaveBeenCalledTimes(3);
    expect(saved()?.tokens?.access_token).toBe("at");
  });

  it("seeds in-memory state from previously stored state", async () => {
    const provider = makeOAuthProvider({
      redirectUrl: "http://127.0.0.1:1/cb",
      clientName: "x",
      persist: () => {},
      openAuthorization: () => {},
      state: { tokens: { access_token: "restored", token_type: "bearer" } },
    });
    expect((await provider.tokens())?.access_token).toBe("restored");
  });

  it("opens the browser when the SDK requests authorization", async () => {
    const { provider, openAuthorization } = base();
    const url = new URL("https://notion.example/oauth/authorize?x=1");
    await provider.redirectToAuthorization(url);
    expect(openAuthorization).toHaveBeenCalledWith(url);
  });

  it("throws if the verifier is read before being saved", () => {
    const { provider } = base();
    expect(() => provider.codeVerifier()).toThrow(/code verifier/);
  });

  it("drops a stale client (redirect port changed, no tokens) to force re-registration", () => {
    const provider = makeOAuthProvider({
      redirectUrl: "http://127.0.0.1:5555/callback", // current loopback port
      clientName: "x",
      persist: () => {},
      openAuthorization: () => {},
      state: {
        clientInformation: {
          client_id: "old",
          redirect_uris: ["http://127.0.0.1:1111/callback"], // registered on a dead port
        },
      },
    });
    expect(provider.clientInformation()).toBeUndefined();
  });

  it("keeps a client registered THIS session even if its DCR response omits our redirect_uri (Dropbox)", async () => {
    // Fresh connect: no prior state, current loopback port 5555.
    const provider = makeOAuthProvider({
      redirectUrl: "http://127.0.0.1:5555/callback",
      clientName: "x",
      persist: () => {},
      openAuthorization: () => {},
    });
    // The SDK registers a client this session; Dropbox's unverified DCR response
    // does NOT echo our redirect_uri (or normalises it away).
    await provider.saveClientInformation!({
      client_id: "fresh",
      redirect_uris: [], // provider didn't return our redirect_uri
    });
    // Still no tokens yet (the code exchange is the very next step) — the client
    // MUST survive so the exchange has client information (no "Existing OAuth
    // client information is required" error).
    expect((await provider.clientInformation())?.client_id).toBe("fresh");
  });

  it("keeps the client on a port mismatch when valid tokens exist (refresh path)", async () => {
    const provider = makeOAuthProvider({
      redirectUrl: "http://127.0.0.1:5555/callback",
      clientName: "x",
      persist: () => {},
      openAuthorization: () => {},
      state: {
        tokens: { access_token: "at", token_type: "bearer" },
        clientInformation: {
          client_id: "keep",
          redirect_uris: ["http://127.0.0.1:1111/callback"],
        },
      },
    });
    expect((await provider.clientInformation())?.client_id).toBe("keep");
  });

  it("supplies an unpredictable OAuth `state` so an AS that requires it doesn't reject with 'Missing state parameter'", async () => {
    const provider = makeOAuthProvider({
      redirectUrl: "http://127.0.0.1:5555/callback",
      clientName: "x",
      persist: () => {},
      openAuthorization: () => {},
    });
    const s1 = await provider.state?.();
    const s2 = await provider.state?.();
    expect(s1).toBeTruthy();
    expect(typeof s1).toBe("string");
    expect((s1 as string).length).toBeGreaterThanOrEqual(16);
    expect(s1).not.toBe(s2); // fresh per call (unpredictable)
  });
});
