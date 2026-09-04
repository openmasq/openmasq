import { describe, it, expect, vi, afterEach } from "vitest";
import { createSink } from "./index";

/**
 * Blocking LOCAL hosts — the one transport rule no consumer
 * exercises (the desktop tests the consent queue and the sanitize walk, never the host).
 *
 * What it prevents: a `pnpm dev` left open all day, reloaded on every
 * save, counting the developer as a cohort in the product's numbers.
 * What it must NOT prevent: production, including where `location` doesn't exist
 * (server rendering, packaged desktop `file://`) — hence a POSITIVE block only.
 */
const flush = (): Promise<unknown> => new Promise((r) => setTimeout(r, 0));

function wire(hostname: string | null, allowLocalhost?: boolean) {
  const fetchFn = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal("fetch", fetchFn);
  vi.stubGlobal("navigator", {}); // neither Do-Not-Track nor GPC
  if (hostname === null) vi.stubGlobal("location", undefined);
  else vi.stubGlobal("location", { hostname });
  const s = createSink({ getAnonId: () => "anon-x", defaultSource: "test" });
  s.configureAnalytics({ key: "phc_test", apiHost: "https://eu.i.posthog.com", allowLocalhost });
  s.setAnalyticsConsent(true);
  return { s, fetchFn };
}

describe("niveau `usage` — un build empaqueté hors CI ne rapporte que l'usage", () => {
  afterEach(() => vi.unstubAllGlobals());

  function wireTier(tier: "full" | "usage" | undefined) {
    const fetchFn = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchFn);
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("location", undefined); // the packaged desktop's `file://`
    const s = createSink({ getAnonId: () => "anon-x", defaultSource: "test" });
    s.configureAnalytics({ key: "phc_test", tier, usageEvents: new Set(["app_open"]) });
    s.setAnalyticsConsent(true);
    return { s, fetchFn };
  }

  it("laisse passer un événement d'usage, retient un diagnostic", async () => {
    const { s, fetchFn } = wireTier("usage");
    s.sink({ name: "model_latency", props: {} });
    await flush();
    expect(fetchFn).not.toHaveBeenCalled();
    s.sink({ name: "app_open", props: {} });
    await flush();
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("retient le canal `$exception` entier", async () => {
    const { s, fetchFn } = wireTier("usage");
    s.captureError({ scope: "db", code: "open", name: "Error", message: "boom" });
    await flush();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("un niveau `usage` SANS liste ne laisse rien passer — allow-list, jamais deny-list", async () => {
    const fetchFn = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchFn);
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("location", undefined);
    const s = createSink({ getAnonId: () => "anon-x", defaultSource: "test" });
    s.configureAnalytics({ key: "phc_test", tier: "usage" });
    s.setAnalyticsConsent(true);
    s.sink({ name: "app_open", props: {} });
    await flush();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("le niveau `full` (défaut) laisse tout passer, `$exception` compris", async () => {
    const { s, fetchFn } = wireTier(undefined);
    s.sink({ name: "model_latency", props: {} });
    s.captureError({ scope: "db", code: "open", name: "Error", message: "boom" });
    await flush();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe("hôte local ⇒ rien ne part", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "app.localhost", "macbook.local"])(
    "%s ne joint pas PostHog",
    async (hostname) => {
      const { s, fetchFn } = wire(hostname);
      s.sink({ name: "app_open", props: {} });
      await flush();
      expect(fetchFn).not.toHaveBeenCalled();
    },
  );

  it("le canal d'erreurs est bloqué par la même règle", async () => {
    const { s, fetchFn } = wire("localhost");
    s.captureError({ scope: "test", code: "boom", fatal: true });
    await flush();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("`allowLocalhost` rouvre le canal — la vérification délibérée depuis un poste", async () => {
    const { s, fetchFn } = wire("localhost", true);
    s.sink({ name: "app_open", props: {} });
    await flush();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("le blocage est POSITIF : le doute émet", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("un vrai hôte émet", async () => {
    const { s, fetchFn } = wire("landing.acme.test");
    s.sink({ name: "app_open", props: {} });
    await flush();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("pas de `location` du tout (rendu serveur, `file://`) ⇒ on émet", async () => {
    const { s, fetchFn } = wire(null);
    s.sink({ name: "app_open", props: {} });
    await flush();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("un hôte qui CONTIENT « localhost » sans en être un émet", async () => {
    const { s, fetchFn } = wire("localhost.attaquant.fr");
    s.sink({ name: "app_open", props: {} });
    await flush();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
