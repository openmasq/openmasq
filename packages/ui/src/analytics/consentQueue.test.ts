import { describe, it, expect, vi, afterEach } from "vitest";
import { createSink } from "@openmasq/analytics";

const flush = (): Promise<unknown> => new Promise((r) => setTimeout(r, 0));

/**
 * Le bug que ceci épingle : `app_open` est dispatché AU MONTAGE, la décision de
 * consentement arrive avec les réglages (un effet plus tard). Tout ce qui partait avant
 * était jeté en silence — PostHog n'a JAMAIS reçu un seul `app_open` de production,
 * pendant que le dev en voyait des milliers (StrictMode y rejoue l'effet APRÈS la
 * décision). Sans event d'entrée, ni activation ni rétention ne sont calculables.
 *
 * L'invariant qui rend l'attente acceptable : RIEN ne part avant la décision.
 */
function wire() {
  const fetchFn = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal("fetch", fetchFn);
  vi.stubGlobal("navigator", {}); // pas de Do-Not-Track / GPC
  const s = createSink({ getAnonId: () => "anon-x", defaultSource: "test" });
  s.configureAnalytics({ key: "phc_test", apiHost: "https://eu.i.posthog.com" });
  return { s, fetchFn };
}

const names = (fetchFn: ReturnType<typeof vi.fn>): string[] =>
  fetchFn.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string).event);

describe("file d'attente avant la décision de consentement", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejoue l'event du démarrage quand le consentement arrive (le trou d'`app_open`)", async () => {
    const { s, fetchFn } = wire();
    s.sink({ name: "app_open", props: {} });
    await flush();
    expect(fetchFn, "rien ne doit partir avant la décision").not.toHaveBeenCalled();
    s.setAnalyticsConsent(true);
    await flush();
    expect(names(fetchFn)).toEqual(["app_open"]);
  });

  it("un REFUS jette la file — elle n'a jamais quitté la machine", async () => {
    const { s, fetchFn } = wire();
    s.sink({ name: "app_open", props: {} });
    s.captureError({ scope: "uncaught", code: "boot", message: "boom" });
    s.setAnalyticsConsent(false);
    await flush();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("une erreur de démarrage attend elle aussi, au lieu de se perdre", async () => {
    const { s, fetchFn } = wire();
    s.captureError({ scope: "uncaught", code: "boot", message: "boom" });
    s.setAnalyticsConsent(true);
    await flush();
    expect(names(fetchFn)).toEqual(["$exception"]);
  });

  it("un lancement automatisé (e2e/bench) n'émet RIEN, consentement ou pas", async () => {
    const { s, fetchFn } = wire();
    s.sink({ name: "app_open", props: {} });
    s.setAnalyticsSuspended(true);
    s.setAnalyticsConsent(true);
    s.sink({ name: "section_change", props: { section: "chats" } });
    await flush();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("la file est BORNÉE — un démarrage qui boucle ne peut pas la faire enfler", async () => {
    const { s, fetchFn } = wire();
    for (let i = 0; i < 50; i++) s.sink({ name: "section_change", props: { section: "chats" } });
    s.setAnalyticsConsent(true);
    await flush();
    expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(20);
    expect(fetchFn.mock.calls.length).toBeGreaterThan(0);
  });
});
