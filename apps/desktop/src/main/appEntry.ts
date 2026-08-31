import { app } from "electron";
import { isAbsolute } from "node:path";

// ── Where THIS app lives, for a child that needs to relaunch it ──────────────
// Two consumers re-spawn this binary in helper mode (agent browser,
// @playwright/mcp) and a third declares the dev entry to LaunchServices. All
// three need the SAME fact — the app's path — and none can
// derive it from its own process:
//
//   • `require.main.filename` is the literal « electron » in Electron's
//     main process (measured: Electron's bootstrap IS the main module, not
//     the app's entry point). Spawned as-is, the child resolves « electron » AGAINST
//     ITS OWN CWD, finds nothing, and opens a native « Unable to find
//     Electron app at …/apps/desktop/electron » dialog — modal, so the child never
//     returns and `pnpm dev` / the Playwright run never finishes.
//   • `process.argv[1]` is « . » under `electron-vite dev`: correct only
//     as long as the child inherits the launcher's cwd, and wrong as soon as launched from
//     the repo root.
//
// `app.getAppPath()` is the only one that's absolute and independent of cwd.

/** Pure part, so the regression above is pinnable without an Electron runtime. */
export function helperEntryArgs(packaged: boolean, appPath: string): string[] {
  // Packaged: execPath IS the app, the bundled entry loads on its own (and a
  // packaged Electron ignores an argv entry anyway).
  if (packaged) return [];
  // Fail closed: better a spawn that fails with a message than a child
  // stuck on a native dialog nobody can close in CI.
  if (!isAbsolute(appPath)) {
    throw new Error(`helper spawn: chemin d'app non absolu (${appPath})`);
  }
  return [appPath];
}

/** Argv to hand a child Electron so it re-enters THIS app (helper modes). */
export function helperSpawnArgs(): string[] {
  return helperEntryArgs(app.isPackaged, app.getAppPath());
}
