import { test, expect } from "@playwright/test";
import { launchApp } from "./helpers";

/**
 * The startup SMOKE test — the only check that catches EVERYTHING that kills the app on
 * load: an optional peer bundled as a throw (the landmine `scripts/check-bundle.mjs`
 * scans for statically), a native module missing from the packaged tree, an IPC handler that
 * throws while registering. The build passes in all these cases; only a real LAUNCH
 * sees them — which is why the release does it before signing (release.yml).
 * Deliberately minimal: launch, one window, some DOM, quit — no model,
 * no network, no cost.
 */
test("l'app construite démarre : une fenêtre, du DOM, zéro erreur de chargement", async () => {
  const { app, page } = await launchApp();
  // A mounted React root is enough — the renderer loaded and main didn't throw.
  await expect(page.locator("#root")).toBeAttached();
  await app.close();
});
