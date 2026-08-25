import { afterEach, describe, expect, it, vi } from "vitest";
import { store, TTL } from "./store.js";

const code = () =>
  store.putCode({
    platform: "demo",
    clientId: "c1",
    redirectUri: "http://127.0.0.1:0/cb",
    codeChallenge: "abc",
    upstream: { accessToken: "u_tok" },
  });

afterEach(() => vi.useRealTimers());

describe("oauth store", () => {
  it("issues unique crypto-random client ids", () => {
    const a = store.registerClient(["http://127.0.0.1:0/cb"]);
    const b = store.registerClient(["http://127.0.0.1:0/cb"]);
    expect(a.clientId).not.toBe(b.clientId);
    expect(a.clientId.length).toBeGreaterThan(20);
  });

  it("authorization codes are single-use", () => {
    const c = code();
    expect(store.takeCode(c)?.clientId).toBe("c1");
    expect(store.takeCode(c)).toBeUndefined();
  });

  it("expires codes after their TTL", () => {
    vi.useFakeTimers();
    const c = code();
    vi.advanceTimersByTime(TTL.code + 1);
    expect(store.takeCode(c)).toBeUndefined();
  });

  it("resolves a broker token to its upstream tokens", () => {
    const t = store.issueToken("demo", { accessToken: "u_tok" });
    expect(store.resolveToken(t.accessToken)?.upstream.accessToken).toBe("u_tok");
    expect(store.resolveToken("nope")).toBeUndefined();
  });

  it("rotates refresh tokens and invalidates the old access token", () => {
    const t = store.issueToken("demo", { accessToken: "u_tok" });
    const rotated = store.rotateRefresh(t.refreshToken);
    expect(rotated?.accessToken).toBeDefined();
    expect(rotated?.accessToken).not.toBe(t.accessToken);
    expect(store.resolveToken(t.accessToken)).toBeUndefined();
    expect(store.rotateRefresh(t.refreshToken)).toBeUndefined();
  });
});
