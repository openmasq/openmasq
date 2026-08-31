import { brandHeader } from "@openmasq/branding";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpTransport } from "./http";

/**
 * The device token is a TWO-SIDED CACHE: only success was remembered, never failure.
 * A backend that can't sign (secret absent ⇒ deliberately closed 503) was therefore
 * re-requested on every sync call — 44 server errors in two days, 25 of them from one
 * device in a few minutes, and just as many exceptions in the dashboards. The
 * sync itself kept going: the bare-id header is the intended fallback.
 */
function transport(fetchImpl: typeof fetch) {
  return httpTransport({
    baseUrl: "https://api.test",
    getToken: () => "jwt",
    getDeviceId: () => "dev-1",
    getDeviceSecret: () => "s3cret",
    fetch: fetchImpl,
  });
}

const listVaultsBody = JSON.stringify({ vaults: [] });

/** A fake `fetch` that counts token-minting calls and serves `status` for them. */
function fakeFetch(tokenStatus: number) {
  const mintCalls: string[] = [];
  const headers: Array<Record<string, string>> = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    if (href.includes("/token")) {
      mintCalls.push(href);
      return new Response(tokenStatus === 200 ? JSON.stringify({ token: "tok", expiresIn: 3600 }) : "{}", {
        status: tokenStatus,
      });
    }
    headers.push((init?.headers ?? {}) as Record<string, string>);
    return new Response(listVaultsBody, { status: 200 });
  }) as unknown as typeof fetch;
  return { impl, mintCalls, headers };
}

beforeEach(() => vi.useRealTimers());

describe("device-token mint — le repli ne doit pas marteler", () => {
  it("un 503 n'est demandé qu'UNE fois, puis la synchro repart sur l'identifiant nu", async () => {
    const { impl, mintCalls, headers } = fakeFetch(503);
    const t = transport(impl);

    await t.listVaults();
    await t.listVaults();
    await t.listVaults();

    expect(mintCalls).toHaveLength(1);
    // The three calls still went out — the id header, not the token.
    expect(headers).toHaveLength(3);
    for (const h of headers) {
      expect(h[brandHeader("device-id")]).toBe("dev-1");
      expect(h[brandHeader("device-token")]).toBeUndefined();
    }
  });

  it("un REFUS (403) attend le palier le plus long, pas les 30 s d'un hoquet", async () => {
    vi.useFakeTimers();
    const { impl, mintCalls } = fakeFetch(403);
    const t = transport(impl);

    await t.listVaults();
    expect(mintCalls).toHaveLength(1);

    // 30 s (a hiccup's first tier) isn't enough to reopen a refusal.
    vi.advanceTimersByTime(60_000);
    await t.listVaults();
    expect(mintCalls).toHaveLength(1);

    // The maximum tier, though, eventually reopens: a re-registered device must be able to restart.
    vi.advanceTimersByTime(900_000);
    await t.listVaults();
    expect(mintCalls).toHaveLength(2);
  });

  it("un succès reste mis en cache — un seul frappe pour plusieurs appels", async () => {
    const { impl, mintCalls, headers } = fakeFetch(200);
    const t = transport(impl);

    await t.listVaults();
    await t.listVaults();

    expect(mintCalls).toHaveLength(1);
    expect(headers.every((h) => h[brandHeader("device-token")] === "tok")).toBe(true);
  });
});
