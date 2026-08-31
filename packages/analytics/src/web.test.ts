import { describe, it, expect, vi, afterEach } from "vitest";
import { createWebAnalytics, PAGEVIEW_KEYS } from "./web";

const flush = (): Promise<unknown> => new Promise((r) => setTimeout(r, 0));

type Ev = { name: "$pageview"; $current_url?: string; $pathname?: string; channel?: string };

const ALLOWED = { $pageview: [...PAGEVIEW_KEYS, "channel"] };

function wire(urlMode: "full" | "path", href: string) {
  const fetchFn = vi.fn(async () => ({ ok: true }));
  const url = new URL(href);
  const store = new Map<string, string>();
  vi.stubGlobal("fetch", fetchFn);
  vi.stubGlobal("navigator", {}); // neither Do-Not-Track nor GPC
  vi.stubGlobal("window", { location: { href: url.href, origin: url.origin, pathname: url.pathname } });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  const a = createWebAnalytics<Ev>({
    allowed: ALLOWED,
    source: "test",
    anonKey: "om_test_anon",
    urlMode,
    config: { key: "phc_test", apiHost: "https://eu.i.posthog.com" },
  });
  a.configure();
  return { a, fetchFn };
}

/** The properties actually POSTed, event by event. */
const sent = (fetchFn: ReturnType<typeof vi.fn>): Record<string, unknown>[] =>
  fetchFn.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string).properties);

describe("createWebAnalytics — l'URL publiée", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("⛔ mode `path` : la query ne quitte JAMAIS le navigateur (`/invite?token=` est un jeton utilisable)", async () => {
    const { a, fetchFn } = wire("path", "https://app.acme.test/invite?token=SECRET-INVITE&org=acme#frag");
    a.capturePageview("/invite");
    await flush();
    const props = sent(fetchFn)[0];
    expect(props.$current_url).toBe("https://app.acme.test/invite");
    expect(JSON.stringify(props)).not.toContain("SECRET-INVITE");
  });

  it("mode `full` : un site public garde sa query — c'est là que vivent les UTM", async () => {
    const { a, fetchFn } = wire("full", "https://landing.acme.test/prix?utm_source=x");
    a.capturePageview("/prix");
    await flush();
    expect(sent(fetchFn)[0].$current_url).toBe("https://landing.acme.test/prix?utm_source=x");
  });
});

describe("createWebAnalytics — le dédoublonnage du $pageview", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("le double montage de StrictMode ne compte pas deux fois", async () => {
    const { a, fetchFn } = wire("full", "https://landing.acme.test/prix");
    a.capturePageview("/prix");
    a.capturePageview("/prix");
    await flush();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("un aller-retour A→B→A compte bien trois vues", async () => {
    const { a, fetchFn } = wire("full", "https://landing.acme.test/a");
    a.capturePageview("/a");
    (window as unknown as { location: { href: string } }).location.href = "https://landing.acme.test/b";
    a.capturePageview("/b");
    (window as unknown as { location: { href: string } }).location.href = "https://landing.acme.test/a";
    a.capturePageview("/a");
    await flush();
    expect(sent(fetchFn).map((p) => p.$pathname)).toEqual(["/a", "/b", "/a"]);
  });

  it("en mode `path`, deux query différentes sur le même chemin restent UNE vue", async () => {
    const { a, fetchFn } = wire("path", "https://app.acme.test/admin?tab=membres");
    a.capturePageview("/admin");
    (window as unknown as { location: { href: string } }).location.href = "https://app.acme.test/admin?tab=facturation";
    a.capturePageview("/admin");
    await flush();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("createWebAnalytics — la marche de nettoyage reste le point de passage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("une clé non déclarée dans ALLOWED est jetée, même passée en `extra`", async () => {
    const { a, fetchFn } = wire("full", "https://landing.acme.test/prix");
    a.capturePageview("/prix", { channel: "desktop-production", email: "jean@exemple.fr" });
    await flush();
    const props = sent(fetchFn)[0];
    expect(props.channel).toBe("desktop-production");
    expect(props.email).toBeUndefined();
  });

  it("sans transport configuré, rien ne part (lecture fail-closed)", async () => {
    const fetchFn = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchFn);
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", { location: { href: "https://x.test/", origin: "https://x.test", pathname: "/" } });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    const a = createWebAnalytics<Ev>({
      allowed: ALLOWED,
      source: "test",
      anonKey: "om_test_anon",
      urlMode: "full",
      config: {}, // neither key nor relay
    });
    a.configure();
    a.capturePageview("/");
    await flush();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
