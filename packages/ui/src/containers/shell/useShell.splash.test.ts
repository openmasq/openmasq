import { describe, expect, it } from "vitest";
import { MIN_SPLASH_MS, splashVisible } from "./useShell";

/**
 * The launch curtain. Its rule fits in one sentence — it leaves once the session is
 * resolved AND the floor has elapsed, whichever comes later — but each half
 * covers a distinct defect, so both are pinned down.
 */
describe("splashVisible — le rideau de lancement", () => {
  it("reste tant que la session n'est pas résolue", () => {
    expect(splashVisible({ authEnabled: true, authLoading: true, minDone: true })).toBe(true);
  });

  it("reste jusqu'au plancher, même si la session est résolue instantanément", () => {
    // This is the COMMON case: the auth gate settles from disk, without
    // waiting on the network. Without a floor, the curtain flickers and the animation is never seen.
    expect(splashVisible({ authEnabled: true, authLoading: false, minDone: false })).toBe(true);
  });

  it("part quand les deux conditions sont réunies", () => {
    expect(splashVisible({ authEnabled: true, authLoading: false, minDone: true })).toBe(false);
  });

  it("n'apparaît jamais sans porte de compte (aperçu navigateur, mobile sans auth)", () => {
    // Nothing to resolve: imposing a curtain would be pure delay, with nothing gained.
    expect(splashVisible({ authEnabled: false, authLoading: true, minDone: false })).toBe(false);
  });

  it("le plancher laisse la composition entrer entièrement (fondu 0,4 s + 6 × 0,12 s)", () => {
    // The number is derived from the animation, not picked by feel — if it drops back under ~1,1 s,
    // the curtain leaves before it has arrived.
    expect(MIN_SPLASH_MS).toBeGreaterThanOrEqual(1120);
  });
});
