import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPlatformToken } from "./tokenFetch";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("fetchPlatformToken — the send's hang guard", () => {
  it("a resolved token passes through", async () => {
    await expect(fetchPlatformToken(async () => "jwt-abc")).resolves.toEqual({
      ok: true,
      token: "jwt-abc",
    });
  });

  it("a SETTLED null is « none » — genuinely no session, not an outage", async () => {
    await expect(fetchPlatformToken(async () => null)).resolves.toEqual({ ok: false, reason: "none" });
    await expect(fetchPlatformToken(undefined)).resolves.toEqual({ ok: false, reason: "none" });
  });

  it("a REJECTION is « error » — an unreachable server that fails FAST, never « none »", async () => {
    // ECONNREFUSED / DNS / a 5xx surfaced as a throw: the auth server is DOWN, the
    // session may be fine. Collapsing this into « none » is the bug where a paying
    // user whose wifi dropped was told to « prendre un abonnement ».
    await expect(
      fetchPlatformToken(async () => {
        throw new Error("fetch failed: ECONNREFUSED");
      }),
    ).resolves.toEqual({ ok: false, reason: "error" });
  });

  it("a HANGING fetch times out as « timeout » — never an eternal await (the send bug)", async () => {
    const p = fetchPlatformToken(() => new Promise(() => {}), { timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(4999);
    // still racing…
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toEqual({ ok: false, reason: "timeout" });
  });

  it("a token that lands JUST before the cap wins the race", async () => {
    let resolve!: (t: string) => void;
    const p = fetchPlatformToken(() => new Promise((r) => (resolve = r)), { timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(4990);
    resolve("late-but-fine");
    await expect(p).resolves.toEqual({ ok: true, token: "late-but-fine" });
  });

  it("a settled null RETRIES once behind a forced reconnect — « Réessayer » works when the server is back", async () => {
    // The reported bug: the auth server came back, but nothing re-drove a refresh, so the
    // app stayed « session pas connectée » until an app RELOAD.
    let calls = 0;
    const getToken = async () => (++calls === 1 ? null : "jwt-after-refresh");
    const reconnect = async () => ({ id: "u1" });
    await expect(fetchPlatformToken(getToken, { reconnect })).resolves.toEqual({
      ok: true,
      token: "jwt-after-refresh",
    });
    expect(calls).toBe(2);
  });

  it("a reconnect that fails leaves the FIRST verdict — the copy stays the one reasoned about", async () => {
    const out = await fetchPlatformToken(async () => null, { reconnect: async () => null });
    expect(out).toEqual({ ok: false, reason: "none" });
  });

  it("a TIMEOUT never spends a second cap on a reconnect", async () => {
    // A server that just failed to answer for the full cap won't answer a refresh either;
    // retrying would double the wait to say the same thing.
    let reconnects = 0;
    const p = fetchPlatformToken(() => new Promise(() => {}), {
      timeoutMs: 5000,
      reconnect: async () => {
        reconnects += 1;
        return { id: "u1" };
      },
    });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(p).resolves.toEqual({ ok: false, reason: "timeout" });
    expect(reconnects).toBe(0);
  });
});
