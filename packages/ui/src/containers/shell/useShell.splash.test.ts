import { describe, expect, it } from "vitest";
import { MIN_SPLASH_MS, splashVisible } from "./useShell";

/**
 * Le rideau de lancement. Sa règle tient en une phrase — il part quand la session est
 * résolue ET que le plancher est écoulé, le plus tard des deux — mais chaque moitié
 * couvre un défaut distinct, alors les deux sont épinglées.
 */
describe("splashVisible — le rideau de lancement", () => {
  it("reste tant que la session n'est pas résolue", () => {
    expect(splashVisible({ authEnabled: true, authLoading: true, minDone: true })).toBe(true);
  });

  it("reste jusqu'au plancher, même si la session est résolue instantanément", () => {
    // C'est le cas COURANT : la porte d'authentification se règle depuis le disque, sans
    // attendre le réseau. Sans plancher, le rideau clignote et l'animation ne se voit pas.
    expect(splashVisible({ authEnabled: true, authLoading: false, minDone: false })).toBe(true);
  });

  it("part quand les deux conditions sont réunies", () => {
    expect(splashVisible({ authEnabled: true, authLoading: false, minDone: true })).toBe(false);
  });

  it("n'apparaît jamais sans porte de compte (aperçu navigateur, mobile sans auth)", () => {
    // Rien à résoudre : imposer un rideau serait un délai pur, sans contrepartie.
    expect(splashVisible({ authEnabled: false, authLoading: true, minDone: false })).toBe(false);
  });

  it("le plancher laisse la composition entrer entièrement (fondu 0,4 s + 6 × 0,12 s)", () => {
    // Le chiffre est dérivé de l'animation, pas choisi au jugé — s'il repasse sous ~1,1 s,
    // le rideau repart avant d'être arrivé.
    expect(MIN_SPLASH_MS).toBeGreaterThanOrEqual(1120);
  });
});
