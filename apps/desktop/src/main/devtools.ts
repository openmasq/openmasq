import * as electron from "electron";

/**
 * DevTools do NOT exist in the packaged app — on any window.
 *
 * Without this lock they were actually reachable: the app sets no application
 * menu, so Electron ships its DEFAULT menu, "Toggle Developer Tools"
 * included — a menu-bar item, not an insider's shortcut. Opened on the
 * main window, they give the renderer console, i.e. `window.openmasq`
 * (the entire IPC surface) in interactive access, plus the debugger on our bundle.
 *
 * What this protects, and what it doesn't: it's a HOT-INTROSPECTION
 * lock, the Chromium-side counterpart of the fuses that already cut `--inspect` and
 * `NODE_OPTIONS` on the Node side (`scripts/afterPack.cjs`). Code at rest stays readable
 * in the asar — that's not the point, and nothing here claims to prevent it.
 *
 * `devTools: false` makes `openDevTools()` AND the menu item inert on the window
 * that carries it. The key applies per window, hence ONE home and six spreads — a window created
 * without it would fall back to Electron's default (`true`) without anything failing loudly.
 *
 * In dev, everything stays open: `index.ts` opens DevTools at launch, and debugging
 * the agent browser needs it. ⚠️ Don't confuse this with Playwright's CDP
 * (`--remote-debugging-*`): the e2e tests drive the BUILT app through that channel, which this
 * preference doesn't touch.
 */
// NAMESPACE import, not `{ app }`: unit tests mock `electron`
// PARTIALLY, and vitest refuses a named export absent from the mock AT IMPORT — this module
// gets pulled in by their import chains. Via the namespace, a mock with no `app` gives
// `undefined` (so "never packaged", the same answer as in dev: DevTools allowed).
export const DEVTOOLS_PREF = Object.freeze({ devTools: !electron.app?.isPackaged });
