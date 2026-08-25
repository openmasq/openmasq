import { BRAND } from "@openmasq/branding";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * L'IDENTITÉ de l'app doit être STABLE — et l'ancienne forme ne l'était pas.
 *
 * Elle poussait l'`installId` (`adoptStableId`) depuis le démarrage du renderer, en
 * parallèle, et pariait que la file d'attente du sink durerait plus longtemps que
 * l'aller-retour IPC. Deux façons de perdre ce pari, toutes deux GRAVÉES puisque
 * l'adoption n'écrase jamais un id déjà posé :
 *   • la file part la première → un `anon-…` aléatoire est persisté ;
 *   • `updates.current()` échoue ou n'existe pas → idem.
 * L'install ne pouvait alors plus JAMAIS devenir stable. Mesuré dans PostHog le 12/08 :
 * 291 identités `anon-…` contre 46 uuid, dont une neuve le jour même.
 *
 * Ces cas épinglent l'ordre de résolution et, surtout, ce qui est PERSISTÉ.
 */

const KEY = `${BRAND.slug}.analytics.aid`;
const UUID = "6f1e4c2a-0b7d-4a91-9f33-2c8e5a71b0d4";

// Le module lit `localStorage` au premier appel : un faux suffit, et il doit être posé
// AVANT l'import (le module est évalué une fois).
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const { setStableIdSource, __resetAnalyticsIdForTests, analyticsDistinctId } = await import("./posthog");

describe("id d'analytics — stable, et jamais gelé sur un repli", () => {
  beforeEach(() => {
    store.clear();
    __resetAnalyticsIdForTests();
  });

  it("adopte l'id de la plateforme sur une install NEUVE, et le persiste", async () => {
    setStableIdSource(async () => UUID);
    expect(await analyticsDistinctId()).toBe(UUID);
    // Persisté : un profil vidé le retrouvera par la plateforme, un profil intact par ici.
    expect(store.get(KEY)).toBe(UUID);
  });

  it("ne peut PAS partir avant que la source ait répondu (c'était la course)", async () => {
    let resolve!: (v: string) => void;
    setStableIdSource(() => new Promise<string>((r) => (resolve = r)));
    const inFlight = analyticsDistinctId();
    // La résolution est en attente : le sink `await` cette promesse, donc aucun événement
    // ne peut être envoyé sous un id provisoire.
    resolve(UUID);
    expect(await inFlight).toBe(UUID);
    expect(store.get(KEY)).toBe(UUID);
  });

  it("un id DÉJÀ posé gagne toujours — une install existante ne se refend pas en deux", async () => {
    store.set(KEY, "anon-vieilleinstall");
    setStableIdSource(async () => UUID);
    expect(await analyticsDistinctId()).toBe("anon-vieilleinstall");
    expect(store.get(KEY)).toBe("anon-vieilleinstall");
  });

  it("⛔ une source qui ÉCHOUE ne grave RIEN — le lancement suivant réessaie", async () => {
    setStableIdSource(async () => {
      throw new Error("IPC indisponible");
    });
    const id = await analyticsDistinctId();
    expect(id).toMatch(/^anon-/);
    // LE point du correctif : rien en localStorage, donc l'install n'est pas condamnée à
    // cet id. Auparavant il y était écrit, et l'adoption n'écrasant jamais, c'était fini.
    expect(store.get(KEY)).toBeUndefined();
  });

  it("une source qui rend `undefined` ne grave rien non plus", async () => {
    setStableIdSource(async () => undefined);
    expect(await analyticsDistinctId()).toMatch(/^anon-/);
    expect(store.get(KEY)).toBeUndefined();
  });

  it("SANS source du tout, l'aléatoire est persisté — c'est le mieux disponible", async () => {
    // Mobile / aperçu web : aucune plateforme n'offre d'id. Ne pas persister ferait une
    // « personne » par lancement, ce qui est exactement le mal qu'on soigne.
    const id = await analyticsDistinctId();
    expect(id).toMatch(/^anon-/);
    expect(store.get(KEY)).toBe(id);
  });

  it("une seule identité par session, même si la source change d'avis", async () => {
    setStableIdSource(async () => UUID);
    const first = await analyticsDistinctId();
    setStableIdSource(async () => "un-autre-id");
    expect(await analyticsDistinctId()).toBe(first);
  });
});
