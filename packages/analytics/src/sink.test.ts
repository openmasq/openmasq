import { describe, it, expect, vi, afterEach } from "vitest";
import { createSink } from "./index";

/**
 * Le blocage des hôtes LOCAUX — la seule règle du transport qu'aucun consommateur
 * n'exerce (le bureau teste la file de consentement et le nettoyage, jamais l'hôte).
 *
 * Ce qu'elle empêche : un `pnpm dev` ouvert toute la journée, rechargé à chaque
 * sauvegarde, qui compte le développeur comme une cohorte dans les chiffres du produit.
 * Ce qu'elle ne doit PAS empêcher : la production, y compris là où `location` n'existe
 * pas (rendu serveur, `file://` du bureau empaqueté) — d'où un blocage POSITIF seulement.
 */
const flush = (): Promise<unknown> => new Promise((r) => setTimeout(r, 0));

function wire(hostname: string | null, allowLocalhost?: boolean) {
  const fetchFn = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal("fetch", fetchFn);
  vi.stubGlobal("navigator", {}); // ni Do-Not-Track ni GPC
  if (hostname === null) vi.stubGlobal("location", undefined);
  else vi.stubGlobal("location", { hostname });
  const s = createSink({ getAnonId: () => "anon-x", defaultSource: "test" });
  s.configureAnalytics({ key: "phc_test", apiHost: "https://eu.i.posthog.com", allowLocalhost });
  s.setAnalyticsConsent(true);
  return { s, fetchFn };
}

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
