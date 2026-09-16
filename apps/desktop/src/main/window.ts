// The main BrowserWindow: its security posture (sandboxed preload, top-frame navigation
// pinned to the app origin, external opens scheme-gated), its menus, and the dev wiring.
import { BrowserWindow, clipboard, Menu } from "electron";
import { join } from "path/posix";
import { DEVTOOLS_PREF } from "./devtools";
import { setMainWindow } from "./mainWindowRef";
import { stopAgentBrowser, setAppMainFocused } from "./mcp/browser";
import { safeOpenExternal } from "./net/safeOpen";
import { devOnly } from "./security/devOnly";
import { markWindowShown } from "./store/safeStore";
import { loadWindowTone } from "./windowTone";

export function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 860,
    minHeight: 540,
    show: false,
    // The window's own background (the rounded corners, the strip a resize exposes)
    // follows the THEME (`windowTone.ts`): the tone last reported by the renderer.
    backgroundColor: loadWindowTone(),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      // No DevTools on a packaged app — the POLICY and why it exists: devtools.ts.
      ...DEVTOOLS_PREF,
      preload: join(__dirname, "../preload/index.js"),
      // The preload imports ONLY `electron` and has NO Node dependency, so it runs under
      // `sandbox:true`: the OS-level sandbox confines the renderer process too. Smoke-test
      // the boot after any preload change. No `webviewTag`: nothing needs one.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
    // Only now release the keychain-gated auth-session read (safeStore.ts), so the OS
    // prompt appears over a visible window.
    markWindowShown();
  });

  // The agent browser is a SEPARATE alwaysOnTop process: with the window gone it would
  // float over everything (on macOS closing the window does NOT quit the app).
  mainWindow.on("close", () => stopAgentBrowser());

  // Scheme-gated external open (`./safeOpen`).
  mainWindow.webContents.setWindowOpenHandler((details) => {
    safeOpenExternal(details.url);
    return { action: "deny" };
  });

  // Keep the TOP FRAME on the app's own origin: any other top-frame navigation (an XSS
  // `location.href=…`, a form post, meta-refresh) would load remote content with
  // `window.openmasq` (full IPC) still exposed.
  const isAppOrigin = (u: string): boolean => {
    // `devOnly`: read raw, this env var would let anyone who sets the launch environment
    // name an origin the top frame may navigate to.
    const dev = devOnly(process.env["ELECTRON_RENDERER_URL"]);
    if (dev && u.startsWith(dev)) return true;
    return u.startsWith("file://") || u === "about:blank";
  };
  const guardTopNav = (e: Electron.Event, url: string): void => {
    if (!isAppOrigin(url)) {
      e.preventDefault();
      console.warn(`[security] blocked top-frame navigation to ${new URL(url).host || url}`);
    }
  };
  mainWindow.webContents.on("will-navigate", guardTopNav);
  mainWindow.webContents.on("will-redirect", guardTopNav);

  // Right-click menu (Electron has none by default): link open/copy, basic copy/paste.
  mainWindow.webContents.on("context-menu", (_e, params) => {
    const items: Electron.MenuItemConstructorOptions[] = [];
    if (params.linkURL) {
      const url = params.linkURL;
      items.push(
        { label: "Ouvrir le lien", click: () => safeOpenExternal(url) },
        { label: "Copier l'adresse du lien", click: () => clipboard.writeText(url) }
      );
    }
    if (params.selectionText) {
      if (items.length) items.push({ type: "separator" });
      items.push({ label: "Copier", role: "copy" });
    }
    if (params.isEditable) {
      if (items.length) items.push({ type: "separator" });
      items.push(
        { label: "Couper", role: "cut" },
        { label: "Coller", role: "paste" },
        { label: "Tout sélectionner", role: "selectAll" }
      );
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: mainWindow });
  });

  // `devOnly`: a packaged build must never take its UI from an env-named URL (remote code
  // inside a signed bundle holding the keychain grant).
  const devUrl = devOnly(process.env["ELECTRON_RENDERER_URL"]);
  if (devUrl) {
    // Dev: mirror the renderer console into this terminal and open DevTools.
    mainWindow.webContents.on(
      "console-message",
      (_e, level, message, line, sourceId) => {
        const tag = level === 3 ? "error" : level === 2 ? "warn" : "log";
        const where = sourceId ? ` (${sourceId.split("/").pop()}:${line})` : "";
        console.log(`[renderer:${tag}] ${message}${where}`);
      }
    );
    mainWindow.webContents.openDevTools({ mode: "detach" });
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  // Publish the window so the magic-link deep-link handlers can reach it.
  setMainWindow(mainWindow);

  // The MAIN window's focus feeds the overlay's visibility gate (combined with the child's
  // own `AGENT_FOCUS`), so it hides whenever the app isn't frontmost.
  mainWindow.on("focus", () => setAppMainFocused(true));
  mainWindow.on("blur", () => setAppMainFocused(false));
}
