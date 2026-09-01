/**
 * `electron`, as seen by the UNIT SUITE — a stub, never the real package.
 *
 * ⚠️ The real `electron/index.js` does not return an API: it returns the binary's PATH, and
 * if `path.txt` is missing it DOWNLOADS 295 MB on import. Locally the binary is there, so
 * nothing shows; on a runner it is not, and the first test file touching `electron` pays for
 * the download IN THE MIDDLE of the suite. Lived through once: `fetch failed`, "Electron
 * failed to install correctly", one red file out of 647 — and two minutes later ANOTHER file
 * importing the same module went green. So it was not a broken test but a RACE, arbitrated
 * by luck alone, which no local `pnpm test`
 * could show.
 *
 * The alias (`vitest.config.ts`) removes the race by removing its cause: nothing in the
 * suite resolves the real package any more, hence no network, and local and CI see exactly
 * the same thing.
 *
 * What the stub IS NOT: an Electron API. Every name returns an object that THROWS on first
 * access, with the procedure to follow. A test that needs a behaviour declares it, like the
 * 21 files that already do (`vi.mock("electron", …)`, which wins over this alias). An import
 * that was merely incidental — the `webFetchMany` case — costs nothing: nobody touches the
 * object, so nothing throws.
 */

function absent(name: string): unknown {
  const boom = (prop: string): never => {
    throw new Error(
      `electron.${name}.${prop} — the unit suite has NO Electron (stub: ` +
        `scripts/vitest/vitest.electron-stub.ts). Declare what this test needs:\n` +
        `  vi.mock("electron", () => ({ ${name}: { ${prop}: vi.fn() } }));`,
    );
  };
  return new Proxy(
    {},
    {
      get(_t, prop) {
        // `then` is probed by every `await`: throwing here would turn a plain
        // `await import(...)` into an unreadable failure. A module is not a promise.
        if (prop === "then" || typeof prop === "symbol") return undefined;
        return boom(String(prop));
      },
    },
  );
}

/** `app` is the EXCEPTION on its lifecycle: registering a listener at module load
 *  (`app.on("before-quit", …)` — `runtime/quitState.ts`) is a normal Electron pattern, not a
 *  behaviour a test asserts. Throwing there would force every test that transitively imports
 *  a main file to mock electron for nothing. Listeners are swallowed; ALL THE REST of `app`
 *  keeps the "throw while dictating the vi.mock" contract. */
const APP_LIFECYCLE = new Set(["on", "once", "off", "removeListener", "addListener"]);
const appBase = absent("app") as Record<PropertyKey, unknown>;
export const app = new Proxy(
  {},
  {
    get(_t, prop) {
      if (typeof prop === "string" && APP_LIFECYCLE.has(prop)) return () => app;
      return appBase[prop as string];
    },
  },
);
export const BrowserWindow = absent("BrowserWindow");
export const ipcMain = absent("ipcMain");
export const ipcRenderer = absent("ipcRenderer");
export const contextBridge = absent("contextBridge");
export const dialog = absent("dialog");
export const shell = absent("shell");
export const session = absent("session");
export const clipboard = absent("clipboard");
export const Menu = absent("Menu");
export const Notification = absent("Notification");
export const safeStorage = absent("safeStorage");
export const systemPreferences = absent("systemPreferences");
export const utilityProcess = absent("utilityProcess");
export const webFrame = absent("webFrame");
export const webUtils = absent("webUtils");

export default {
  app,
  BrowserWindow,
  ipcMain,
  ipcRenderer,
  contextBridge,
  dialog,
  shell,
  session,
  clipboard,
  Menu,
  Notification,
  safeStorage,
  systemPreferences,
  utilityProcess,
  webFrame,
  webUtils,
};
