import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { launchApp } from "./helpers";
import { watchMainStderr } from "./mainStderr";

/**
 * Launch the PACKAGED application — the one a user actually installs.
 *
 * ⚠️ Why this exists alongside `boot.e2e.ts`, which already launches the app: they launch
 * two different trees. `boot` runs the `out/` build straight off the disk; this one runs
 * what electron-builder produced — the asar archive, whatever `asarUnpack` pulled back
 * out of it, `extraResources`/`extraFiles`, the native modules the packer FLATTENS, and
 * the C++ runtime DLLs beside the exe. Every Windows failure this project has paid for
 * lived in that second tree and was invisible in the first: the flattened dependency
 * tree of 0.3.2, and the missing redistributable that left a user with a dead install.
 * A green `boot` says the code is right; only this says the PACKAGE is.
 *
 * Deliberately weaker assertions than `boot`: a window, `#root`, and no fatal line on
 * main stderr. It asserts nothing about being signed in — the packaged app opens on the
 * sign-in screen with a fresh profile, and that is correct behaviour.
 *
 * Points at the binary with `OPENMASQ_PACKAGED_EXE`; skips when unset, so a local
 * `pnpm test` never fails for lack of a package.
 */
const EXE = process.env.OPENMASQ_PACKAGED_EXE;

test("l'app EMPAQUETÉE démarre : une fenêtre, du DOM, zéro erreur fatale", async () => {
  test.skip(!EXE, "OPENMASQ_PACKAGED_EXE unset — no packaged build to launch");
  expect(existsSync(EXE!), `OPENMASQ_PACKAGED_EXE points nowhere: ${EXE}`).toBe(true);

  // Fresh profile: an installed app must start from nothing, which is the state of the
  // machine that just ran the installer.
  const profile = resolve(__dirname, `.profile-packaged-${process.pid}`);
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  process.env.OPENMASQ_USER_DATA_DIR = profile;

  const { app, page } = await launchApp({ executablePath: EXE });
  const main = watchMainStderr(app);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) =>
    errors.push(`requestfailed: ${r.url()} — ${r.failure()?.errorText ?? "?"}`),
  );

  await expect(page.locator("#root")).toBeAttached();

  const reported = [...errors, ...main.fatal().map((l) => `main stderr (fatal): ${l}`)];
  expect(
    reported,
    `the packaged app started but reported errors:\n${reported.join("\n")}\n\n${main.report()}`,
  ).toEqual([]);
  await app.close();
  rmSync(profile, { recursive: true, force: true });
});
