import { BRAND } from "@openmasq/branding";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The app's IDENTITY must be STABLE — and the old shape was not.
 *
 * It pushed the `installId` (`adoptStableId`) from the renderer's startup, in parallel,
 * and bet that the sink's queue would outlast the IPC round-trip. Two ways to lose that
 * bet, both ENGRAVED since adoption never overwrites an id already set:
 *   • the queue leaves first → a random `anon-…` is persisted;
 *   • `updates.current()` fails or does not exist → same.
 * The install could then NEVER become stable again. Measured in PostHog on 12/08:
 * 291 `anon-…` identities against 46 uuids, one of them brand new that same day.
 *
 * These cases pin the resolution order and, above all, what is PERSISTED.
 */

const KEY = `${BRAND.slug}.analytics.aid`;
const UUID = "6f1e4c2a-0b7d-4a91-9f33-2c8e5a71b0d4";

// The module reads `localStorage` on the first call: a fake is enough, and it must be set
// BEFORE the import (the module is evaluated once).
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
    // Persisted: a wiped profile finds it again through the platform, an intact one here.
    expect(store.get(KEY)).toBe(UUID);
  });

  it("ne peut PAS partir avant que la source ait répondu (c'était la course)", async () => {
    let resolve!: (v: string) => void;
    setStableIdSource(() => new Promise<string>((r) => (resolve = r)));
    const inFlight = analyticsDistinctId();
    // The resolution is pending: the sink `await`s this promise, so no event can be sent
    // under a provisional id.
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
    // THE point of the fix: nothing in localStorage, so the install is not condemned to
    // this id. It used to be written there, and adoption never overwriting, that was that.
    expect(store.get(KEY)).toBeUndefined();
  });

  it("une source qui rend `undefined` ne grave rien non plus", async () => {
    setStableIdSource(async () => undefined);
    expect(await analyticsDistinctId()).toMatch(/^anon-/);
    expect(store.get(KEY)).toBeUndefined();
  });

  it("SANS source du tout, l'aléatoire est persisté — c'est le mieux disponible", async () => {
    // Mobile / web preview: no platform offers an id. Not persisting would make one
    // "person" per launch, which is exactly the ill being cured.
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
