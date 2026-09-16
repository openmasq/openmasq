// Electron MAIN process entry — the COMPOSITION root: which mode this process runs in,
// what must happen before `whenReady`, then the order in which the pieces are wired
// (`window.ts`, `deepLinks.ts`, `ipc/register*Ipc.ts`, `mainNotifiers.ts`). Also the agent-browser
import { getMainWindow, withMainWindow } from "./mainWindowRef";
// / helper-process branch points. See apps/desktop/CLAUDE.md for the process map.
import { app, BrowserWindow } from "electron";
import { join } from "path";
import { registerDataIpc } from "./ipc/registerDataIpc";
import { startBroker, stopBroker } from "./broker";
import { registerProtocolClient } from "./protocolClient";
import { registerSyncSecretsIpc } from "./ipc/registerSyncSecretsIpc";
import { registerKeysIpc } from "./ipc/registerKeysIpc";
import { registerFilesIpc } from "./ipc/registerFilesIpc";
import { registerCloudFsIpc } from "./ipc/registerCloudFsIpc";
import { registerLocalFsIpc } from "./ipc/registerLocalFsIpc";
import { flushEgressLog } from "./net/egressLog";
import { initConfirmationMode } from "./mcp/confirmationMode";
import { registerPostureIpc } from "./ipc/registerPostureIpc";
import { registerSubscriptionIpc } from "./ipc/registerSubscriptionIpc";
import { registerWindowIpc } from "./ipc/registerWindowIpc";
import { warmLocalNer } from "./localNer";
import {
  mcpCloseAll,
} from "./mcp";
import {
  isAgentBrowserProcess,
  runAgentBrowserMain,
  isPlaywrightMcpProcess,
  runPlaywrightMcpMain,
  registerBrowserIpc,
  stopAgentBrowser,
  setAgentTabsReporter,
  setAgentShortcutReporter,
} from "./mcp/browser";
import { setupAutoUpdates } from "./updates";
import { installErrorReporting, reportMainError, reportMainEvent } from "./runtime/errorReport";
import { installMediaPermissions } from "./runtime/permissions";
import { registerNotifyIpc } from "./notify";
import { registerClaudeSkillsIpc } from "./claudeSkills"; // « Importer mes compétences Claude »
import { configureBundledOcr, configureBundledDoctr } from "./runtime/ocrAssets";
import { registerPythonIpc } from "./python";
import { registerPdfIpc } from "./pdf";
import { registerWebIpc } from "./net/webIpc";
import { initSentryMain } from "../sentry/main";
import { applyProfilePath } from "./profile";
import { registerEnvIpc } from "./ipc/registerEnvIpc"; import { installCustomStackCspFor } from "./customStackCsp";  import { AUTH_SCHEME, installDeepLinkHandlers, deliverAuthUrl } from "./deepLinks";
import { createWindow } from "./window";
import { registerChatHandlers } from "./ipc/registerChatIpc";
import { registerAppHandlers } from "./ipc/registerAppIpc";
import { registerMcpHandlers } from "./ipc/registerMcpIpc";
import { installMainNotifiers } from "./mainNotifiers";
import { warnIfNoAtRestEncryption } from "./atRestWarning";
import { devOnly } from "./security/devOnly";

// ── Helper modes ─────────────────────────────────────────────────────────────
// This SAME binary re-spawned with OPENMASQ_AGENT_BROWSER=1 runs ONLY the agent browser
// (own userData, own CDP endpoint, no app UI, no lock). See mcp/browser/agentMain.ts.
const AGENT_BROWSER_MODE = isAgentBrowserProcess();
// Crash reporting BEFORE the modes split: one init covers the three (the `process` tag
// says which one crashed).
const SENTRY_MODE = isAgentBrowserProcess() ? "agent-browser" : isPlaywrightMcpProcess() ? "playwright-mcp" : "app";
initSentryMain(SENTRY_MODE, app.isPackaged);
if (AGENT_BROWSER_MODE) {
  runAgentBrowserMain();
}
// OPENMASQ_PWMCP=1 runs @playwright/mcp in APP mode (never ELECTRON_RUN_AS_NODE). Selected
// by ENV, not argv: a packaged Electron ignores an argv entry and relaunches the app.
const PLAYWRIGHT_MCP_MODE = isPlaywrightMcpProcess();
if (PLAYWRIGHT_MCP_MODE) {
  runPlaywrightMcpMain();
}
// Either helper mode skips ALL normal app init (window, scheme, single-instance lock).
const HELPER_MODE = AGENT_BROWSER_MODE || PLAYWRIGHT_MCP_MODE;

// WHICH `userData` profile this instance opens: the decision lives in `./profile`.
const PROFILE = HELPER_MODE ? null : applyProfilePath(app, process.env);

// E2E hook: driving Electron over CDP sets `navigator.webdriver = true`, which bot
// challenges read. Gated to the e2e launch; must run before app-ready.
if (devOnly(process.env.OPENMASQ_E2E)) {
  app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled");
}

// DEV: the mock keychain silences the macOS Keychain prompt an unsigned binary gets on
// every launch (Chromium's own OSCrypt asks before any of our code). Dev data still
// round-trips, just not Keychain-protected. A packaged, signed build keeps the real one;
// `OPENMASQ_REAL_KEYCHAIN=1` forces it in dev. Must run before app-ready.
if (!app.isPackaged && process.env.OPENMASQ_REAL_KEYCHAIN !== "1") {
  app.commandLine.appendSwitch("use-mock-keychain");
}

// ── Magic-link deep link (`<protocol>://auth/callback`) ─────────────────────
// The OS hands the verified link to this app via the custom protocol; the renderer
// exchanges its PKCE code. Skipped in a HELPER process: no scheme, no lock (it must
// coexist with the main app).
if (!HELPER_MODE) {
  registerProtocolClient(AUTH_SCHEME);

  // A second deep-link launch must reach the running instance, not spawn a new one.
  const gotSingleInstanceLock = app.requestSingleInstanceLock();
  if (!gotSingleInstanceLock) {
    app.quit();
  }
}

installDeepLinkHandlers();

app.whenReady().then(async () => {
  // A HELPER process (agent browser / playwright-mcp) runs its OWN logic — never the app.
  if (HELPER_MODE) return;
  // BEFORE any IPC can land: an un-inited store would not persist a change.
  initConfirmationMode(app.getPath("userData"));
  // The local DB is opened PER-ACCOUNT (`db:set-user`), NOT here, so a shared machine
  // never surfaces one account's chats to another.
  const chatStreamsBusy = registerChatHandlers();
  registerDataIpc();
  // Confirmation POSTURE: one trust boundary, one module.
  registerPostureIpc();
  // "Is the Claude Code CLI installed?" A boolean, never a path.
  registerSubscriptionIpc();
  // The whole file-read trust boundary (read gate + fetch host allow-list) lives together.
  registerFilesIpc();
  // The Library's folder browser over the Filesystem connector's OWN grants, deliberately
  // not routed through `mcp:call-tool` (see ipc/registerLocalFsIpc.ts).
  registerLocalFsIpc();
  registerCloudFsIpc();
  if (PROFILE) registerEnvIpc(PROFILE, getMainWindow);
  registerWindowIpc(getMainWindow);
  registerKeysIpc();
  registerSyncSecretsIpc();
  registerAppHandlers();
  registerMcpHandlers();
  // Bundled, sha256-pinned OCR assets: no network fetch into the WASM parser.
  configureBundledOcr();
  configureBundledDoctr();
  installMediaPermissions(); // Electron refuses getUserMedia with no handler
  registerNotifyIpc(getMainWindow);
  registerClaudeSkillsIpc();
  if (PROFILE) installCustomStackCspFor(PROFILE, join(__dirname, "../renderer/index.html")); // CSP widened BEFORE loadFile
  createWindow();
  // Re-warm the NER engine when the user comes back: the worker is evicted after
  // inactivity, and the first redaction would otherwise repay the cold load.
  app.on("browser-window-focus", () => warmLocalNer());
  registerBrowserIpc();
  setAgentTabsReporter((tabs) => withMainWindow((w) => w.webContents.send("browser:tabs", tabs)));
  // A shortcut intercepted by the agent window → focus main + open the palette (a modal,
  // which the modal gate uses to hide the agent overlay).
  setAgentShortcutReporter((name) =>
    withMainWindow((w) => {
      w.focus();
      w.webContents.send("browser:shortcut", name);
    }),
  );
  registerPythonIpc();
  // HTML→PDF in an isolated, script-less, network-less window (rule 7).
  registerPdfIpc();
  registerWebIpc();
  installErrorReporting(getMainWindow);
  // The pre-install teardown is AWAITED: the app re-spawns ITSELF as extra Electron
  // instances (agent browser, @playwright/mcp), and ShipIt aborts the update swap while
  // it sees >1 running instance.
  setupAutoUpdates(getMainWindow, {
    onBeforeInstall: async () => {
      await Promise.allSettled([mcpCloseAll(), stopAgentBrowser(), stopBroker()]);
    },
    reportError: (code, err) => reportMainError("updates", code, err),
    reportEvent: (event) => reportMainEvent(event),
    // Background auto-install holds off as long as a chat:* stream is in flight.
    mainBusy: chatStreamsBusy,
  });
  // AFTER every `ipcMain.handle` above, on purpose: a parentless dialog runs a NESTED run
  // loop on macOS, and the already-loading renderer would reach handlers not yet registered.
  warnIfNoAtRestEncryption();
  // Cold start via the magic link on Windows/Linux: the URL is in argv (macOS: open-url).
  if (process.platform !== "darwin") {
    deliverAuthUrl(process.argv.find((a) => a.startsWith(`${AUTH_SCHEME}://`)));
  }
  // Launch the local MCP broker sidecar (best-effort; non-blocking).
  startBroker().catch((err) => console.error("[broker] start failed:", err));
  installMainNotifiers();
  // MCP connectors are opened PER-ACCOUNT (`mcp:set-user`), NOT here, so a shared machine
  // never leaves one account's OAuth tokens usable by another.

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  // Fire-and-forget (Electron won't await before-quit); the UPDATE path awaits its own.
  mcpCloseAll().catch(() => {});
  void stopAgentBrowser();
  void stopBroker();
  // Land the last debounce window of the egress log (best-effort evidence for the user).
  void flushEgressLog();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
