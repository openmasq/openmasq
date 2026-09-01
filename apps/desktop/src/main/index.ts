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

// ── Isolated agent-browser process ───────────────────────────────────────────
// This SAME binary re-spawned with OPENMASQ_AGENT_BROWSER=1 runs ONLY the
// controllable browser window (its own userData, its own CDP endpoint, no app UI,
// no single-instance lock). It sets itself up here and the normal app init below
// is guarded off, so the two never mix. See mcp/browser/agentMain.ts.
const AGENT_BROWSER_MODE = isAgentBrowserProcess();
// Sentry BEFORE the three modes: both helpers re-enter through THIS file, so a single
// init covers them (the `process` tag says which one crashed) — bootstrap included.
const SENTRY_MODE = isAgentBrowserProcess() ? "agent-browser" : isPlaywrightMcpProcess() ? "playwright-mcp" : "app";
initSentryMain(SENTRY_MODE, app.isPackaged);
if (AGENT_BROWSER_MODE) {
  runAgentBrowserMain();
}
// This SAME binary re-entered with OPENMASQ_PWMCP=1 runs @playwright/mcp (B1: app-mode,
// no ELECTRON_RUN_AS_NODE). Selected by ENV, not an argv script — a packaged Electron
// ignores an argv entry and would relaunch the normal app (which quits on the lock).
const PLAYWRIGHT_MCP_MODE = isPlaywrightMcpProcess();
if (PLAYWRIGHT_MCP_MODE) {
  runPlaywrightMcpMain();
}
// Either helper mode skips ALL normal app init (window, scheme, single-instance lock).
const HELPER_MODE = AGENT_BROWSER_MODE || PLAYWRIGHT_MCP_MODE;

// WHICH `userData` profile this instance opens (e2e hook, dev, staging) — the whole
// decision lives in `./profile`, with its tests. Must run before `whenReady`.
const PROFILE = HELPER_MODE ? null : applyProfilePath(app, process.env);

// E2E hook: Playwright drives Electron over CDP, which sets `navigator.webdriver
// = true`. Cloudflare reads that single flag and classifies the (otherwise
// perfectly credible — real Chrome UA + matching client hints) keyless webview as
// a bot, so its "Just a moment…" challenge loops forever and never clears. This
// Chromium switch removes the navigator.webdriver exposure so the webview looks
// like the same browser it is in normal use. Gated to the e2e launch; no effect
// in production. Must run before app-ready.
if (process.env.OPENMASQ_E2E) {
  app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled");
}

// DEV: silence the macOS Keychain prompt at startup. Chromium's OWN cookie/network
// encryption (OSCrypt) fetches the shared "Electron Safe Storage" keychain key when
// the network service inits — BEFORE the window paints — and on an unsigned/ad-hoc-
// signed dev binary that grant never persists, so it re-prompts every launch (our
// safeStorage stores are separately deferred to login; this one is native, upstream
// of any of our code). The mock keychain makes BOTH Chromium and our safeStorage use
// a deterministic in-process key instead of the real Keychain: no prompt, and dev
// data still round-trips across restarts (just not real-Keychain-protected — fine in
// dev, which already keeps the DB plaintext). A PACKAGED, Developer-ID-signed +
// notarised build keeps the real Keychain (its "Always Allow" grant persists → the
// prompt is one-time). Env override `OPENMASQ_REAL_KEYCHAIN=1` forces the real one
// (e.g. to test the prod at-rest path in dev). Must run before app-ready.
if (!app.isPackaged && process.env.OPENMASQ_REAL_KEYCHAIN !== "1") {
  app.commandLine.appendSwitch("use-mock-keychain");
}

// ── Magic-link deep link (`<protocol>://auth/callback`) ─────────────────────
// Supabase emails a magic link that, once verified, redirects to
// `<protocol>://auth/callback?code=…`. The OS hands that URL to this app via the
// custom protocol; we forward it to the renderer, which exchanges the PKCE code
// for a session. Register the branding `protocol` as our scheme (dev needs execPath + argv
// so the un-packaged Electron binary is invoked with our entry script).

// Skipped in a HELPER process (agent browser / playwright-mcp): they register no scheme
// and take no lock (they must coexist with the main app, not contend for its lock).
if (!HELPER_MODE) {
  registerProtocolClient(AUTH_SCHEME);

  // A second deep-link launch must reach the running instance, not spawn a new
  // one — without the lock the deep link would open a fresh app and lose state.
  const gotSingleInstanceLock = app.requestSingleInstanceLock();
  if (!gotSingleInstanceLock) {
    app.quit();
  }
}

installDeepLinkHandlers();

app.whenReady().then(async () => {
  // A HELPER process (agent browser / playwright-mcp) runs its OWN logic — never the app.
  if (HELPER_MODE) return;
  // Point the main-owned confirmation-mode store at userData BEFORE any IPC can land —
  // an un-inited store reads as "standard" (the default) but would not persist a change.
  initConfirmationMode(app.getPath("userData"));
  // E2E hook: skip the local DB so the renderer store stays localStorage-only and
  // tests can seed settings deterministically (the DB would otherwise hydrate over
  // them). No effect in normal use.
  // The local DB is opened PER-ACCOUNT (`db:set-user`, driven by the renderer once
  // the signed-in account resolves) — NOT here — so a shared machine never surfaces
  // one account's chats to another. (E2E still fully disables it via the env flag.)
  const chatStreamsBusy = registerChatHandlers();
  // DB persistence + embeddings IPC (split into ipc/registerDataIpc — pure data plane).
  registerDataIpc();
  // Confirmation POSTURE (session auto-approve, the mode, the org's floor and its blocked
  // connectors) — one trust boundary, one module. Each handler's relationship to the
  // untrusted renderer is stated there.
  registerPostureIpc();
  // "Is the Claude Code CLI installed?" — what makes the `claude-cli` model exist
  // (or not) in the pickers. A boolean, never a path.
  registerSubscriptionIpc();
  // File + link IPC (read-gate audit H-1 + fetch/preview host allow-list audit M4) —
  // split into ipc/registerFilesIpc so the whole file-read trust boundary lives together.
  registerFilesIpc();
  // The Bibliothèque's folder browser over the Filesystem connector's OWN grants —
  // a second consumer of `main/fs`, deliberately not routed through `mcp:call-tool`
  // (see ipc/registerLocalFsIpc.ts for what it does and does not widen).
  registerLocalFsIpc();
  // The remote counterpart: listing a connected Drive/OneDrive (read-only, scope
  // parity with the connector's tools — see `cloudfs/index.ts`).
  registerCloudFsIpc();
  // This instance's environment + its switch (`PROFILE` null in helper mode: nothing to serve).
  if (PROFILE) registerEnvIpc(PROFILE, getMainWindow);
  registerWindowIpc(getMainWindow);
  // Write-only provider-API-key IPC (split into ipc/registerKeysIpc — encrypted at rest).
  registerKeysIpc();
  // The sync's two secrets (E2E passphrase + device secret), encrypted at rest.
  registerSyncSecretsIpc();
  registerAppHandlers();
  registerMcpHandlers();
  // Point OCR at the bundled, sha256-pinned traineddata (audit M8) — no TOFU CDN fetch
  // into the native WASM parser on a packaged build. No-op in dev (CDN fallback).
  configureBundledOcr();
  configureBundledDoctr();
  installMediaPermissions(); // mic (dictation): Electron refuses getUserMedia with no handler
  registerNotifyIpc(getMainWindow); // banner + click that brings the window back (./notify.ts)
  registerClaudeSkillsIpc(); // enumerates ~/.claude/skills (./claudeSkills.ts)
  if (PROFILE) installCustomStackCspFor(PROFILE, join(__dirname, "../renderer/index.html")); // self-hosted stack: CSP widened BEFORE loadFile
  createWindow();
  warnIfNoAtRestEncryption(); // M-9: one-time notice if a packaged build has no keychain
  // Re-warms the NER engine when the user COMES BACK to the app: the worker is evicted
  // after 10 min of inactivity (RAM), and without this the first redaction after a pause
  // repays the whole cold load while the user watches the
  // "Redaction" button spin. Also covers the first focus at launch. No-op if already warm.
  app.on("browser-window-focus", () => warmLocalNer());
  // Agent-browser control surface (open/close the isolated agent window, point it
  // at a start URL). The window itself lives in a SEPARATE process, spawned on demand.
  registerBrowserIpc();
  // Forward the agent window's page (url + title) to the renderer so the browser
  // panel's tab reflects what's actually loaded (agent nav / URL bar / clicked link).
  setAgentTabsReporter((tabs) => withMainWindow((w) => w.webContents.send("browser:tabs", tabs)));
  // ⌘K (and future shortcuts) intercepted by the agent window while it has keyboard
  // focus → focus the main window + tell the renderer to open the palette. Opening the
  // palette mounts a modal, which the modal gate uses to hide the agent overlay.
  setAgentShortcutReporter((name) =>
    withMainWindow((w) => {
      w.focus();
      w.webContents.send("browser:shortcut", name);
    }),
  );
  // Sandboxed Python engine (`python:run`): downloads a jailed CPython on first use
  // and runs model-generated code (plots via matplotlib/seaborn, data via yfinance).
  registerPythonIpc();
  // HTML→PDF for a model-authored ```document (`pdf:render-html`): Chromium typesets it
  // in an isolated, script-less, network-less window — see `pdf/CLAUDE.md` (rule 7).
  registerPdfIpc();
  // Batch web reader (`web:fetch-many`) + the live OpenRouter model catalogue
  // (`models:list-openrouter`) — both `safeFetch` egress, registered together.
  registerWebIpc();
  // Main-process error bridge → renderer `$exception` channel (anonymised there).
  installErrorReporting(getMainWindow);
  // Auto-update via the apps/updates Worker feed + the in-app version picker's
  // IPC. `getMainWindow` lets status events reach the current window. The 2nd arg is
  // the pre-install teardown: the app re-spawns ITSELF as extra Electron instances
  // (the agent browser + the @playwright/mcp server, same bundle id), and ShipIt
  // aborts the update swap while it still sees >1 running instance. So kill every
  // child instance — AWAITED — before quitAndInstall (mcpCloseAll takes the
  // playwright-mcp connector's child; stopAgentBrowser/stopBroker the others).
  setupAutoUpdates(getMainWindow, {
    onBeforeInstall: async () => {
      await Promise.allSettled([mcpCloseAll(), stopAgentBrowser(), stopBroker()]);
    },
    // Route updater failures + a prior post-quit ShipIt failure into the $exception channel.
    reportError: (code, err) => reportMainError("updates", code, err),
    // …and the update funnel (check/downloaded/install/installed) into product events.
    reportEvent: (event) => reportMainEvent(event),
    // Background auto-install holds off as long as a chat:* stream is in flight.
    mainBusy: chatStreamsBusy,
  });
  // Cold start via the magic link on Windows/Linux: the URL is in our argv.
  // (macOS uses open-url; buffered until the renderer subscribes.)
  if (process.platform !== "darwin") {
    deliverAuthUrl(process.argv.find((a) => a.startsWith(`${AUTH_SCHEME}://`)));
  }
  // Launch the local MCP broker sidecar (best-effort; non-blocking).
  startBroker().catch((err) => console.error("[broker] start failed:", err));
  installMainNotifiers();
  // MCP connectors are opened PER-ACCOUNT (`mcp:set-user`, driven by the renderer once
  // the signed-in account resolves) — NOT here — so a shared machine never leaves one
  // account's connected integrations (and their OAuth tokens) usable by another. The
  // silent reconnect of that account's stored servers happens inside `setMcpUser`.

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  // Normal-quit teardown (fire-and-forget — Electron won't await async before-quit).
  // The UPDATE path uses the awaited pre-install teardown wired into setupAutoUpdates.
  mcpCloseAll().catch(() => {});
  void stopAgentBrowser();
  void stopBroker();
  // Land the last debounce window of the egress log. Best-effort like the rest of this
  // handler: losing a few seconds of the record on a hard kill is acceptable — nothing else
  // depends on it, it is evidence for the user.
  void flushEgressLog();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
