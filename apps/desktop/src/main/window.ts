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
    // The window's own background — the CONTOUR: what shows at the rounded macOS
    // corners, and in the strip a resize exposes before the renderer repaints it.
    // It follows the THEME (`windowTone.ts`): a fixed near-white was warm under the
    // blue themes and flashed white under the dark ones. This is the tone this
    // machine last reported; the renderer re-reports it a frame after it mounts.
    backgroundColor: loadWindowTone(),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      // No DevTools on a packaged app — the POLICY and why it exists: devtools.ts.
      ...DEVTOOLS_PREF,
      preload: join(__dirname, "../preload/index.js"),
      // SECURITY (audit M-1): the preload imports ONLY `electron` (contextBridge/
      // ipcRenderer) + erased type-only imports and has NO Node dependency (the last
      // one, `process.env`, was removed), so it runs correctly under `sandbox:true`.
      // Sandboxing shrinks the blast radius of any renderer/preload bug: the renderer
      // is already nodeIntegration:false + contextIsolation:true, and the OS-level
      // sandbox now also confines the process. (Verified: preload uses no fs/os/crypto/
      // child_process/require; smoke-test the app boot after any preload change.)
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // webviewTag removed (audit M-1): the keyless ChatGPT <webview> is gone and the
      // agent browser is a separate process — nothing needs <webview>, and leaving it
      // on is a large attack surface for injected content.
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
    // Window is on screen — only now release the keychain-gated auth-session read
    // (see safeStore.ts), so the OS keychain prompt appears AT LOGIN over a visible
    // window rather than during cold boot before first paint.
    markWindowShown();
  });

  // Tear down the agent browser when the main window closes. It's a SEPARATE
  // alwaysOnTop process overlaying the app's panel — with the app window gone it would
  // otherwise float on top of everything (esp. on macOS, where closing the window does
  // NOT quit the app, so `before-quit` never fires). Killing it here covers that path;
  // reopening the window + panel spawns a fresh one on demand.
  mainWindow.on("close", () => stopAgentBrowser());

  // Scheme-gated external open (audit M-3) — shared helper in `./safeOpen`.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    safeOpenExternal(details.url);
    return { action: "deny" };
  });

  // Keep the TOP FRAME on the app's own origin (audit M-2): links open in the external
  // browser via the handler above, but any other top-frame navigation (a renderer XSS
  // doing `location.href=…`, a form post, meta-refresh) would load remote content with
  // `window.openmasq` — full IPC — still exposed. Deny anything that isn't our origin.
  const isAppOrigin = (u: string): boolean => {
    // `devOnly`: honoured unpackaged only. Read raw, this env var is a hole in the very
    // guard it sits in — anyone who can set the app's launch environment (`launchctl
    // setenv`, a LaunchAgent, an edited shortcut; no admin needed) names an origin the
    // top frame may navigate to, with `window.openmasq` — the full IPC — still exposed.
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

  // Right-click menu — Electron has none by default, so a link's real URL was
  // invisible/unreachable. Offer "see / copy / open the link" for any link, plus
  // basic copy/paste, so right-clicking is never a dead gesture.
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

  // Loaded by the dev server in development, from the built file in production. `devOnly`:
  // a packaged build must never take its whole UI from an env-named URL — that is remote
  // code inside a signed bundle holding the keychain grant.
  const devUrl = devOnly(process.env["ELECTRON_RENDERER_URL"]);
  if (devUrl) {
    // Dev convenience: mirror the renderer console into this terminal and open
    // DevTools, so logs (Redux actions, etc.) are visible where you run the app.
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

  // The agent-browser overlay is `alwaysOnTop` and lives in a CHILD process, so it would
  // otherwise float over OTHER apps too. Feed the MAIN window's focus into the visibility
  // gate: combined with the child's own window focus, it hides the overlay whenever the app
  // isn't the frontmost app. (`focus`/`blur` also fire when the child browser window takes
  // focus — that case is covered by the child's `AGENT_FOCUS`, so the overlay stays put.)
  mainWindow.on("focus", () => setAppMainFocused(true));
  mainWindow.on("blur", () => setAppMainFocused(false));
}
