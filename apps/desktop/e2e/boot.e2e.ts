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
  // The STACK, not just the message: "Cannot read properties of undefined" names no file,
  // and in a bundled renderer the file is the whole question.
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}\n      ${(e.stack ?? "(no stack)").split("\n").slice(0, 6).join("\n      ")}`));
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
    // `chrome-error://chromewebdata/` means Chromium REFUSED the navigation, and the
    // reason is an error code only the main process ever sees. Replay the same load with
    // `did-fail-load` attached: ERR_FILE_NOT_FOUND and ERR_BLOCKED_BY_CLIENT are the same
    // blank page here and completely different bugs.
    // Is the BRIDGE there? `window.openmasq.env` is read seven times in the renderer
    // bundle, and `Cannot read properties of undefined (reading 'env')` is exactly what a
    // missing `window.openmasq` produces — i.e. a preload that never ran. Electron reports
    // that on `preload-error`, which nothing was listening to.
    const bridge = await page
      .evaluate(() => ({
        openmasq: typeof (globalThis as Record<string, unknown>).openmasq,
        keys: Object.keys(globalThis).filter((k) => k.toLowerCase().includes("openmasq")),
      }))
      .then((r) => `window.openmasq is ${r.openmasq} · matching globals: ${JSON.stringify(r.keys)}`)
      .catch((e: Error) => `could not evaluate in the page: ${e.message}`);
    const preload = await app
      .evaluate(async ({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (!win) return "no window";
        const path = win.webContents.getLastWebPreferences()?.preload ?? "(none declared)";
        const caught = await new Promise<string>((done) => {
          const t = setTimeout(() => done("no preload-error on reload"), 12_000);
          win.webContents.once("preload-error", (_e, p, err) => {
            clearTimeout(t);
            done(`preload-error on ${p}: ${err?.message ?? err}`);
          });
          win.webContents.reload();
        });
        return `declared preload: ${path} · ${caught}`;
      })
      .catch((e: Error) => `could not ask main about the preload: ${e.message}`);

    const why = await app
      .evaluate(async ({ app: electronApp, BrowserWindow }) => {
        // No node builtins here: the main bundle is ESM, so `require` is not defined in
        // this scope (measured — it cost a CI round trip). Forward slashes are fine,
        // Electron normalises them on Windows.
        const target = `${electronApp.getAppPath()}/out/renderer/index.html`;
        const win = BrowserWindow.getAllWindows()[0];
        if (!win) return `no window · target ${target}`;
        const seen = await new Promise<string>((done) => {
          const t = setTimeout(() => done("no did-fail-load within 15 s"), 15_000);
          win.webContents.once("did-fail-load", (_e, code, desc, validatedURL) => {
            clearTimeout(t);
            done(`code ${code} · ${desc} · ${validatedURL}`);
          });
          win.webContents.once("did-finish-load", () => { clearTimeout(t); done("loaded on retry"); });
          void win.loadFile(target).catch((e: Error) => { clearTimeout(t); done(`loadFile threw: ${e.message}`); });
        });
        return `${seen} · target ${target}`;
      })
      .catch((e: Error) => `could not ask main: ${e.message}`);
    throw new Error(
      `${(failure as Error).message}\n\n` +
        `url: ${url}\n` +
        `why the navigation failed: ${why}\n` +
        `bridge: ${bridge}\n` +
        `preload: ${preload}\n` +
        `errors captured (${errors.length}):\n` +
        (errors.length ? errors.map((e) => `  · ${e}`).join("\n") : "  (none — the page loaded and simply never mounted)") +
        `\n\nfirst 600 chars of the document:\n${html}`,
    );
  }

  expect(errors, `the app mounted but reported errors:\n${errors.join("\n")}`).toEqual([]);
  await app.close();
});
