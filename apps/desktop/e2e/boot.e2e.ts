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
 *
 * ⚠️ It COLLECTS the errors rather than only waiting for the DOM. Its name has always
 * promised "zéro erreur de chargement", but the body only asserted that `#root` attached:
 * when the Windows leg first ran it (13/09), the renderer never mounted and the report was
 * a 120 s timeout on a locator — true, and saying nothing about why. A renderer that throws
 * while mounting, a preload that dies before `contextBridge` runs, a chunk that 404s: all
 * three produce that same empty page, and all three announce themselves on one of the three
 * channels below. Reporting them costs nothing when the app is healthy.
 */
test("l'app construite démarre : une fenêtre, du DOM, zéro erreur de chargement", async () => {
  const { app, page } = await launchApp();

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  page.on("requestfailed", (r) => {
    errors.push(`requestfailed: ${r.url()} — ${r.failure()?.errorText ?? "?"}`);
  });
  // The MAIN process writes to the app's stdio, not to the page: an IPC handler throwing
  // while registering shows up here and nowhere else.
  app.process().stderr?.on("data", (b: Buffer) => errors.push(`main stderr: ${b.toString().trim()}`));

  try {
    await expect(page.locator("#root")).toBeAttached();
  } catch (failure) {
    // Say what the page WAS, since it was not what we asked for. The URL alone catches a
    // path that resolved wrong, which is the classic way this fails on Windows only.
    const url = page.url();
    const html = (await page.content().catch(() => "<unavailable>")).slice(0, 600);
    throw new Error(
      `${(failure as Error).message}\n\n` +
        `url: ${url}\n` +
        `errors captured (${errors.length}):\n` +
        (errors.length ? errors.map((e) => `  · ${e}`).join("\n") : "  (none — the page loaded and simply never mounted)") +
        `\n\nfirst 600 chars of the document:\n${html}`,
    );
  }

  expect(errors, `the app mounted but reported errors:\n${errors.join("\n")}`).toEqual([]);
  await app.close();
});
