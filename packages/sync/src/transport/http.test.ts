import { brandHeader } from "@openmasq/branding";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpTransport } from "./http";

/**
 * Le jeton d'appareil est un CACHE À DEUX FACES : on retenait le succès, jamais l'échec.
 * Un backend qui ne peut pas signer (secret absent ⇒ 503 volontairement fermé) était donc
 * redemandé à chaque appel de synchro — 44 erreurs serveur en deux jours, dont 25 d'un seul
 * appareil en quelques minutes, et autant d'exceptions dans les tableaux de bord. La
 * synchro, elle, continuait : l'en-tête d'identifiant nu est le repli prévu.
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

/** Un faux `fetch` qui compte les appels de frappe du jeton et sert `status` pour eux. */
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
    // Les trois appels sont partis quand même — l'en-tête d'identifiant, pas le jeton.
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

    // 30 s (le premier palier d'un hoquet) ne suffisent pas à rouvrir un refus.
    vi.advanceTimersByTime(60_000);
    await t.listVaults();
    expect(mintCalls).toHaveLength(1);

    // Le palier maximal, lui, finit par rouvrir : un appareil ré-enregistré doit repartir.
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
