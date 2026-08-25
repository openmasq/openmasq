// Electron MAIN process entry: window lifecycle, IPC handlers, and the agent-browser
import { DEVTOOLS_PREF } from "./devtools";
// / helper-process branch points. See apps/desktop/CLAUDE.md for the process map.
import { app, shell, BrowserWindow, ipcMain, dialog, Menu, clipboard } from "electron";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { release } from "node:os";
import { join } from "path";
import {
  streamChat,
  completeWithTools,
  streamWithTools,
  supportsStreamingTools,
  type CompleteToolsOptions,
  type StreamChatOptions,
  type ProviderId,
} from "@openmasq/llm";
import type { McpToolCall } from "@openmasq/mcp";
import { registerDataIpc } from "./ipc/registerDataIpc";
import { getBroker, startBroker, stopBroker } from "./broker";
import { getKey, scrubKeys } from "./store/keys";
import { isByoKeysBlocked } from "./store/keysPolicy";
import { completeOpenRouterConnect } from "./store/openrouterPkce";
import { deepLinkTarget } from "./deepLink";
import { registerProtocolClient } from "./protocolClient";
import { registerSyncSecretsIpc } from "./ipc/registerSyncSecretsIpc";
import { registerKeysIpc } from "./ipc/registerKeysIpc";
import { registerFilesIpc } from "./ipc/registerFilesIpc";
import { registerCloudFsIpc } from "./ipc/registerCloudFsIpc";
import { registerLocalFsIpc, setLocalFsChangeNotifier } from "./ipc/registerLocalFsIpc";
import { decideProviderEndpoint } from "./net/providerEndpoint";
import { noteFetchHostsFromText } from "./net/fetchAllow";
import { flushEgressJournal } from "./net/egressJournal";
import { initConfirmationMode } from "./mcp/confirmationMode";
import { pickGrantDir } from "./mcp/pickGrantDir";
import { registerPostureIpc } from "./ipc/registerPostureIpc";
import { loadWindowTone } from "./windowTone";
import { registerWindowIpc } from "./ipc/registerWindowIpc";
import { encryptionAvailable, markWindowShown, whenWindowShown } from "./store/safeStore";
import { authStoreGet, authStoreRemove, authStoreSet } from "./store/authStore";
import { detectLocalPii, warmLocalNer, type DetectLocalPayload } from "./localNer";
import {
  mcpAdd,
  mcpAddCustom,
  mcpAddStdio,
  mcpSetStdioDirs,
  mcpCallTool,
  mcpCatalog,
  mcpCancelConnect,
  mcpCloseAll,
  mcpConnect,
  mcpConnectDirect,
  mcpAddAccountDirect,
  mcpAddAccountRemote,
  mcpReauthDirect,
  mcpByoCredGroups,
  mcpDisconnect,
  mcpEnableBrowser,
  mcpDisableBrowser,
  mcpList,
  mcpListToolsAll,
  mcpRemove,
  setMcpUser,
  setMcpChangeNotifier,
  setMcpNeedsReconnectNotifier,
  setMcpOauthUrlNotifier,
  setMcpAuthChoiceAsker,
  type McpAuthChoice,
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
  setAppMainFocused,
} from "./mcp/browser";
import { setupAutoUpdates } from "./updates";
import { installErrorReporting, reportMainError, reportMainEvent } from "./runtime/errorReport";
import { installMediaPermissions } from "./runtime/permissions";
import { registerNotifyIpc } from "./notify";
import { registerClaudeSkillsIpc } from "./claudeSkills"; // « Importer mes compétences Claude »
import { configureBundledOcr, configureBundledDoctr } from "./runtime/ocrAssets";
import { safeOpenExternal } from "./net/safeOpen";
import { registerPythonIpc } from "./python";
import { registerPdfIpc } from "./pdf";
import { registerWebIpc } from "./net/webIpc";
import { initSentryMain } from "../sentry/main";
import { applyProfilePath } from "./profile";
import { registerEnvIpc } from "./ipc/registerEnvIpc"; import { BRAND } from "@openmasq/branding"; import type { CredMode } from "./mcp/credMode";

// ── Isolated agent-browser process ───────────────────────────────────────────
// This SAME binary re-spawned with OPENMASQ_AGENT_BROWSER=1 runs ONLY the
// controllable browser window (its own userData, its own CDP endpoint, no app UI,
// no single-instance lock). It sets itself up here and the normal app init below
// is guarded off, so the two never mix. See mcp/browser/agentMain.ts.
const AGENT_BROWSER_MODE = isAgentBrowserProcess();
// Sentry AVANT les trois modes : les deux helpers ré-entrent par CE fichier, donc un seul
// init les couvre (l'étiquette `process` dit lequel a planté) — amorçage compris.
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

// QUEL profil `userData` cette instance ouvre (crochet e2e, dev, staging) — la décision
// entière vit dans `./profile`, avec ses tests. Doit tourner avant `whenReady`.
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
const AUTH_SCHEME = BRAND.protocol;
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

let winRef: BrowserWindow | null = null;
// Monotonic id correlating an `mcp:auth-choice` request with its reply channel.
let authChoiceSeq = 0;
// Buffers a callback URL that arrives before the renderer has subscribed
// (cold start: the link launches the app). Flushed once the renderer is ready.
// `<protocol>://auth/…` → auth:callback (PKCE exchange); `<protocol>://billing/…` →
// billing:callback (post-Stripe-checkout refocus + subscription refresh).
let pendingAuthUrl: string | null = null;
let pendingBillingUrl: string | null = null;
let rendererAuthReady = false;

function flushAuthUrl(): void {
  if (rendererAuthReady && pendingAuthUrl && winRef && !winRef.isDestroyed()) {
    winRef.webContents.send("auth:callback", pendingAuthUrl);
    pendingAuthUrl = null;
  }
}

function flushBillingUrl(): void {
  if (rendererAuthReady && pendingBillingUrl && winRef && !winRef.isDestroyed()) {
    winRef.webContents.send("billing:callback", pendingBillingUrl);
    pendingBillingUrl = null;
  }
}



function deliverAuthUrl(url: string | undefined): void {
  // ONE gate for every deep-link URL the OS hands us (`deepLink.ts`, allow-list +
  // tests): unknown scheme/host/path is refused, never routed by default.
  const target = url ? deepLinkTarget(url, AUTH_SCHEME) : null;
  if (!url || !target) return;
  // `<protocol>://openrouter/callback` is completed HERE, in main, and never forwarded: the
  // provider key it mints is written straight to the encrypted store, so it does not
  // cross the IPC boundary at all (`store/openrouterPkce.ts`). The renderer only learns
  // that a key now exists, via the `keys:connect-openrouter` promise it is awaiting.
  if (target === "openrouter") {
    if (winRef && !winRef.isDestroyed()) {
      if (winRef.isMinimized()) winRef.restore();
      winRef.focus();
    }
    void completeOpenRouterConnect(url);
    return;
  }
  // Bring the app to the front (the user is returning from the system browser).
  if (winRef && !winRef.isDestroyed()) {
    if (winRef.isMinimized()) winRef.restore();
    winRef.focus();
  }
  if (target === "billing") {
    pendingBillingUrl = url;
    flushBillingUrl();
  } else {
    pendingAuthUrl = url;
    flushAuthUrl();
  }
}

// macOS delivers the deep link via open-url (even while running).
app.on("open-url", (event, url) => {
  event.preventDefault();
  deliverAuthUrl(url);
});

// Windows/Linux deliver it as an argv on a second launch, caught by the primary
// instance. (The very first launch's argv is handled in whenReady below.)
app.on("second-instance", (_event, argv) => {
  deliverAuthUrl(argv.find((a) => a.startsWith(`${AUTH_SCHEME}://`)));
});

// The renderer signals it has subscribed; flush anything buffered during boot.
// One readiness gate covers both channels (the renderer subscribes to auth +
// billing at boot).
ipcMain.on("auth:ready", () => {
  rendererAuthReady = true;
  flushAuthUrl();
  flushBillingUrl();
});

function createWindow(): void {
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
      // Pas de DevTools sur une app empaquetée — la POLITIQUE et son pourquoi : devtools.ts.
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
    const dev = process.env["ELECTRON_RENDERER_URL"];
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
        { label: "Copier l'adresse du lien", click: () => clipboard.writeText(url) },
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
        { label: "Tout sélectionner", role: "selectAll" },
      );
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: mainWindow });
  });

  // Loaded by the dev server in development, from the built file in production.
  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    // Dev convenience: mirror the renderer console into this terminal and open
    // DevTools, so logs (Redux actions, etc.) are visible where you run the app.
    mainWindow.webContents.on(
      "console-message",
      (_e, level, message, line, sourceId) => {
        const tag = level === 3 ? "error" : level === 2 ? "warn" : "log";
        const where = sourceId ? ` (${sourceId.split("/").pop()}:${line})` : "";
        console.log(`[renderer:${tag}] ${message}${where}`);
      },
    );
    mainWindow.webContents.openDevTools({ mode: "detach" });
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  // Publish the window so the magic-link deep-link handlers can reach it.
  winRef = mainWindow;

  // The agent-browser overlay is `alwaysOnTop` and lives in a CHILD process, so it would
  // otherwise float over OTHER apps too. Feed the MAIN window's focus into the visibility
  // gate: combined with the child's own window focus, it hides the overlay whenever the app
  // isn't the frontmost app. (`focus`/`blur` also fire when the child browser window takes
  // focus — that case is covered by the child's `AGENT_FOCUS`, so the overlay stays put.)
  mainWindow.on("focus", () => setAppMainFocused(true));
  mainWindow.on("blur", () => setAppMainFocused(false));
}

interface ChatStartPayload extends Omit<StreamChatOptions, "signal"> {
  requestId: string;
}

/**
 * Inject the encrypted-at-rest API key (the renderer no longer carries it) and
 * scrub any stored key from the outgoing messages — a defensive backstop so a key
 * a user pasted into a prompt never reaches the provider. `redaction` resolves the
 * dedicated redaction-model key first, then the provider's own key.
 */
function withKey<
  T extends {
    provider: string;
    apiKey?: string;
    model?: string;
    messages: { role: string; content: string }[];
  },
>(options: T, redaction = false): T {
  // SECURITY (audit M4, hardened): do NOT seed the fetch-host allow-list from OUTGOING
  // renderer message text. A renderer XSS could inject `attacker.com` into a message, get
  // it whitelisted here (even if the send then errors), and exfiltrate the vault via
  // `files:fetch-url`/`links:preview` (the secret rides the outbound query string, which
  // leaves BEFORE any response check). The allow-list is now seeded ONLY from content main
  // RECEIVED — the streamed provider reply (below) and MCP tool results (`callTool.ts`) —
  // which a renderer cannot forge. Residual: previewing a link the user only ever TYPED
  // (never received) needs a future explicit per-URL user grant.
  const rendererKey = options.apiKey; // supplied by the renderer (BYO key, or a platform Supabase token)
  // ⛔ Compte géré : une clé personnelle STOCKÉE ne s'injecte plus — refuser la seule
  // ÉCRITURE ne ferait rien contre une clé posée avant l'adhésion. La clé du modèle de
  // REDACTION reste injectée : la retirer dégraderait la protection (`store/keysPolicy.ts`).
  const storedProviderKey = isByoKeysBlocked() ? undefined : getKey(options.provider);
  const apiKey = rendererKey || (redaction ? getKey("redactModel") : undefined) || storedProviderKey;
  // WHERE this call may be POSTed, and with which key — audit H1/H-2/M5, decided in ONE
  // place (`net/providerEndpoint.ts`, the egress family) so the rule is an allow-list and
  // a provider id nobody enumerated can't fall through it. Throws on a refused endpoint.
  const decided = decideProviderEndpoint(
    { provider: options.provider, apiKey, baseUrl: (options as { baseUrl?: string }).baseUrl },
    { rendererSuppliedKey: !!rendererKey, packaged: app.isPackaged },
  );
  if (decided.warn) console.warn(`[keys] ${decided.warn}`);
  const out: T = {
    ...options,
    apiKey: decided.apiKey,
    messages: options.messages.map((m) => ({ ...m, content: scrubKeys(m.content) })),
  };
  // Absent ⇒ the provider's canonical host. Assign rather than delete: `undefined` is what
  // every `opts.baseUrl || default` in @openmasq/llm reads as "use the default".
  (out as { baseUrl?: string }).baseUrl = decided.baseUrl;
  return out;
}

/** Rend une sonde « des flux en vol ? » — l'auto-installation d'une mise à jour
 *  (`updates/autoInstall.ts`) s'abstient tant qu'un `chat:*` streame. */
function registerChatHandlers(): () => boolean {
  const controllers = new Map<string, AbortController>();

  // E2E hook: record the EXACT payload handed to the provider transport — the
  // redacted messages streamChat()/completeWithTools() POST upstream — so a test can
  // assert no personal data ever leaves the machine on ANY path (plain streaming AND
  // the agentic tool turns). Tool schemas are reduced to their NAMES (the schemas are
  // static noise; the privacy assertion is about messages). Inert without the env var.
  const e2eWireLog = (options: {
    provider?: string;
    model?: string;
    messages?: unknown;
    tools?: unknown[];
  }): void => {
    if (!process.env.OPENMASQ_E2E_WIRE_LOG) return;
    try {
      const tools = Array.isArray(options.tools)
        ? options.tools.map((t) => {
            const o = t as { name?: string; function?: { name?: string } };
            return o.function?.name ?? o.name ?? "?";
          })
        : undefined;
      appendFileSync(
        process.env.OPENMASQ_E2E_WIRE_LOG,
        JSON.stringify({
          provider: options.provider,
          model: options.model,
          messages: options.messages,
          ...(tools ? { tools } : {}),
        }) + "\n",
      );
    } catch {
      /* best-effort: never break a send for the log */
    }
  };

  ipcMain.on("chat:start", async (event, payload: ChatStartPayload) => {
    const { requestId, ...options } = payload;
    const controller = new AbortController();
    controllers.set(requestId, controller);

    e2eWireLog(options);

    const send = (channel: string, ...args: unknown[]) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(`${channel}:${requestId}`, ...args);
      }
    };

    try {
      // Manual iteration so we can capture the generator's RETURN value (token
      // usage) — `for await` would discard it. The final next() carries usage.
      // The model's live reflection rides its OWN channel — never appended to `reply`.
      const onReasoning = (delta: string) => send("chat:reasoning", delta);
      const it = streamChat({ ...withKey(options), signal: controller.signal, onReasoning });
      let r = await it.next();
      let reply = "";
      while (!r.done) {
        if (typeof r.value === "string") reply += r.value;
        send("chat:chunk", r.value);
        r = await it.next();
      }
      // Record hosts in the model's reply too (a link the model surfaced can be previewed) —
      // before `chat:done` reaches the renderer, so `links:preview` finds the host (audit M4).
      noteFetchHostsFromText(reply);
      send("chat:done", r.value);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        send("chat:done");
      } else {
        send("chat:error", err instanceof Error ? err.message : String(err));
      }
    } finally {
      controllers.delete(requestId);
    }
  });

  ipcMain.on("chat:cancel", (_event, requestId: string) => {
    controllers.get(requestId)?.abort();
    controllers.delete(requestId);
  });

  // One-shot, non-streaming completion. Used by the optional model-based
  // redaction proxy to ask a local model which spans of a message are sensitive.
  // Reuses the streaming providers and just accumulates the full reply.
  ipcMain.handle(
    "chat:complete",
    async (_event, options: Omit<StreamChatOptions, "signal">) => {
      let out = "";
      for await (const delta of streamChat(withKey(options, true))) out += delta;
      return out;
    },
  );

  // Offline local PII detection (GLiNER) for the "IA locale (hors-ligne)" engine.
  // Runs in-process (Node); the renderer wraps it into the redaction pipeline.
  ipcMain.handle("redact:detect-local", (_e, payload: DetectLocalPayload) =>
    detectLocalPii(payload),
  );

  // DB persistence + embeddings IPC (split into ipc/registerDataIpc — pure data plane).
  registerDataIpc();
  // Re-scope MCP integrations to the signed-in account (per-account isolation, same
  // trigger points as db:set-user). Closes the previous account's live connectors +
  // re-points MCP storage + reconnects this account's servers. `null` = signed out.
  ipcMain.handle("mcp:set-user", (_e, userId: string | null) => setMcpUser(userId));
  // Confirmation POSTURE (session auto-approve, the mode, the org's floor and its blocked
  // connectors) — one trust boundary, one module. Each handler's relationship to the
  // untrusted renderer is stated there.
  registerPostureIpc();
  // L'environnement de cette instance + sa bascule. `PROFILE` est nul en mode helper,
  // qui n'a ni fenêtre ni renderer à servir.
  if (PROFILE) registerEnvIpc(PROFILE);

  registerWindowIpc(() => winRef);

  // File + link IPC (read-gate audit H-1 + fetch/preview host allow-list audit M4) —
  // split into ipc/registerFilesIpc so the whole file-read trust boundary lives together.
  registerFilesIpc();

  // The Bibliothèque's folder browser over the Filesystem connector's OWN grants —
  // a second consumer of `main/fs`, deliberately not routed through `mcp:call-tool`
  // (see ipc/registerLocalFsIpc.ts for what it does and does not widen).
  registerLocalFsIpc();
  // Le pendant distant : lister un Drive/OneDrive connecté (lecture seule, parité de
  // portée avec les outils du connecteur — voir `cloudfs/index.ts`).
  registerCloudFsIpc();

  // Agentic completion with tool-calling (drives MCP). Non-streaming: returns
  // the assistant text + any tool calls the model wants to run this turn.
  // The agentic turn isn't streamed, so a renderer AbortSignal can't cross IPC.
  // Correlate each call by `requestId` and let `chat:complete-tools-cancel` abort
  // the in-flight provider fetch — so Stop works mid tool-loop, like `chat:cancel`
  // does for streaming.
  const toolControllers = new Map<string, AbortController>();
  ipcMain.handle(
    "chat:complete-tools",
    async (
      _e,
      options: Omit<CompleteToolsOptions, "signal"> & { requestId?: string },
    ) => {
      const { requestId, ...rest } = options;
      const controller = new AbortController();
      if (requestId) toolControllers.set(requestId, controller);
      e2eWireLog(rest as Parameters<typeof e2eWireLog>[0]);
      try {
        return await completeWithTools({ ...withKey(rest), signal: controller.signal });
      } finally {
        if (requestId) toolControllers.delete(requestId);
      }
    },
  );
  ipcMain.on("chat:complete-tools-cancel", (_e, requestId: string) => {
    toolControllers.get(requestId)?.abort();
    toolControllers.delete(requestId);
  });

  // STREAMING agentic tool turn: same as chat:complete-tools but the assistant text
  // streams (so the final answer isn't held back as one blob after a long turn).
  // Emits `chat:tools-chunk:<id>` deltas, then `chat:tools-done:<id>` with the full
  // result, or `chat:tools-error:<id>`. Reuses `toolControllers` + the SAME
  // `chat:complete-tools-cancel` channel so Stop aborts both paths. Providers whose
  // tool turn can't stream (Anthropic/Google) fall back to a single non-streamed done.
  ipcMain.on(
    "chat:stream-tools",
    async (event, options: Omit<CompleteToolsOptions, "signal"> & { requestId?: string }) => {
      const { requestId, ...rest } = options;
      const controller = new AbortController();
      if (requestId) toolControllers.set(requestId, controller);
      e2eWireLog(rest as Parameters<typeof e2eWireLog>[0]);
      const send = (channel: string, ...args: unknown[]) => {
        if (requestId && !event.sender.isDestroyed()) {
          event.sender.send(`${channel}:${requestId}`, ...args);
        }
      };
      try {
        const opts = {
          ...withKey(rest),
          signal: controller.signal,
          // Live progress of the tool-call ARGUMENT length + the tool NAME (a big
          // write_file HTML streams for seconds with no assistant text) → the renderer's
          // Debug Log AND the chat "thinking" indicator (a concrete action).
          onToolArgs: (chars: number, name?: string) => send("chat:tools-args", chars, name),
          // Same live reflection as the plain stream (`chat:start`), for the agentic turn.
          onReasoning: (delta: string) => send("chat:tools-reasoning", delta),
        };
        if (supportsStreamingTools(opts.provider)) {
          const it = streamWithTools(opts);
          let r = await it.next();
          while (!r.done) {
            send("chat:tools-chunk", r.value);
            r = await it.next();
          }
          send("chat:tools-done", r.value);
        } else {
          // Non-streaming providers: one blob, delivered as a single done.
          send("chat:tools-done", await completeWithTools(opts));
        }
      } catch (err) {
        // On abort the renderer already settled its promise (its signal fired) and
        // removed listeners; a late error here is harmless (the loop returns null
        // because its own signal is aborted). Non-abort errors surface normally.
        send("chat:tools-error", err instanceof Error ? err.message : String(err));
      } finally {
        if (requestId) toolControllers.delete(requestId);
      }
    },
  );

  // App + runtime component versions for the Versions settings tab.
  ipcMain.handle("app:versions", () => ({
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    os: `${process.platform} ${release()} (${process.arch})`,
  }));

  // Is this a TEST launch? Read from main's LAUNCH-TIME env — the sandboxed preload
  // has no `process.env`, so the renderer can only learn it here. Discloses a single
  // boolean and grants nothing; it gates the renderer's `E2eBridge` (the programmatic
  // driver for the agentic loop), which is inert in every shipped build.
  ipcMain.handle("app:is-e2e", () => process.env.OPENMASQ_E2E === "1");

  // Write-only provider-API-key IPC (split into ipc/registerKeysIpc — encrypted at rest).
  registerKeysIpc();
  // Les deux secrets de la synchro (phrase E2E + secret d'appareil), chiffrés au repos.
  registerSyncSecretsIpc();
  // Supabase auth session (access + refresh tokens) — encrypted at rest via
  // safeStorage, NOT plaintext localStorage. Keyed by Supabase's own storage keys.
  // Hold the auth-session read (the ONLY keychain touch before sign-in) until the
  // window is on screen, so the OS keychain prompt lands at login, not cold boot.
  ipcMain.handle("authstore:get", async (_e, key: string) => {
    await whenWindowShown();
    return authStoreGet(key);
  });
  ipcMain.handle("authstore:set", async (_e, key: string, value: string) => {
    await whenWindowShown();
    authStoreSet(key, value);
  });
  ipcMain.handle("authstore:remove", async (_e, key: string) => {
    await whenWindowShown();
    authStoreRemove(key);
  });

  // MCP connectors: the main process owns the live HTTP+OAuth connections and
  // returns RAW tool data; the renderer wraps every call in the redaction vault.
  ipcMain.handle("mcp:list", () => mcpList());
  ipcMain.handle("mcp:catalog", () => mcpCatalog());
  // The local broker sidecar's URL + platforms (null until it's healthy).
  ipcMain.handle("mcp:broker", () => getBroker());
  ipcMain.handle(
    "mcp:add",
    (_e, spec: { id: string; name: string; url: string; apiKey?: string }) =>
      // Keep the API key OFF the ServerSpec — mcpAdd stores it encrypted separately.
      mcpAdd({ id: spec.id, name: spec.name, url: spec.url, kind: "http" }, spec.apiKey),
  );
  // SECURITY: a USER-ADDED server is the one connector the app hasn't vetted, so main
  // decides everything about it — it MINTS the id (a renderer-supplied `notion` would
  // hijack that connector's spec), enforces https + no inline credentials, and runs the
  // SSRF guard before the spec is ever persisted. See `mcp/server/customSpec.ts`.
  ipcMain.handle(
    "mcp:add-custom",
    (_e, input: { name?: string; url?: string; apiKey?: string }) => mcpAddCustom(input),
  );
  // SECURITY: renderer passes a catalog id + declared env values + granted path
  // params only — never a command. Main maps the id to the vetted command in
  // catalog.ts and re-validates every path (absolute, existing directory).
  ipcMain.handle(
    "mcp:add-stdio",
    (_e, catalogId: string, env: Record<string, string>, params?: Record<string, string>) =>
      mcpAddStdio(catalogId, env, params),
  );
  // Le sélecteur natif de dossier pour un octroi de chemin MCP : `mcp/pickGrantDir.ts`
  // (l'octroi lui-même, le hint non fiable et le crochet e2e y sont documentés ensemble).
  ipcMain.handle("mcp:pick-dir", (_e, hint: unknown) => pickGrantDir(hint));
  // Ajouter/retirer un dossier autorisé. Le gate est le même que pour un ajout (un dossier
  // neuf doit venir du sélecteur natif de cette session).
  //
  // ⚠️ La connexion vivante est DÉTRUITE avant d'être refaite, et ce n'est pas un détail :
  // `connectServer` court-circuite sur un connecteur déjà connecté (`connected.has(id)` →
  // il rafraîchit les routes et rend la main), et le worker filesystem reçoit ses racines
  // par `FS_ROOTS` AU FORK, une seule fois. Un simple `mcpConnect` laissait donc le
  // périmètre d'avant : le dossier ajouté restait introuvable pour le modèle jusqu'au
  // redémarrage de l'app.
  ipcMain.handle("mcp:set-dirs", (_e, id: string, key: string, dirs: string[]) =>
    mcpSetStdioDirs(id, key, Array.isArray(dirs) ? dirs.map(String) : [], async (sid) => {
      await mcpDisconnect(sid);
      return mcpConnect(sid);
    }),
  );
  ipcMain.handle("mcp:remove", (_e, id: string) => mcpRemove(id));
  ipcMain.handle("mcp:connect", (_e, id: string) => mcpConnect(id));
  ipcMain.handle(
    "mcp:connect-direct",
    (_e, id: string, opts: { mode: CredMode; clientId?: string }) =>
      mcpConnectDirect(id, opts),
  );
  ipcMain.handle(
    "mcp:add-account-direct",
    (_e, id: string, opts: { mode: CredMode; clientId?: string; clientSecret?: string }) =>
      mcpAddAccountDirect(id, opts),
  );
  ipcMain.handle(
    "mcp:add-account-remote",
    (_e, id: string, opts: { url?: string; name?: string; apiKey?: string }) =>
      mcpAddAccountRemote(id, opts),
  );
  ipcMain.handle("mcp:reauth-direct", (_e, id: string) => mcpReauthDirect(id));
  ipcMain.handle("mcp:byo-cred-groups", () => mcpByoCredGroups());
  // Cancel an in-flight interactive connect ("Annuler" on the "Connexion…" state):
  // main tears down the OAuth loopback / device window so no token is minted.
  ipcMain.handle("mcp:cancel-connect", (_e, id: string) => mcpCancelConnect(id));
  ipcMain.handle("mcp:disconnect", (_e, id: string) => mcpDisconnect(id));
  // Controllable-browser connector: opt in (persist flag + spec, connect if the CDP
  // endpoint is already open) / opt out (disconnect + clear flag).
  ipcMain.handle("mcp:enable-browser", () => mcpEnableBrowser());
  ipcMain.handle("mcp:disable-browser", () => mcpDisableBrowser());
  ipcMain.handle("mcp:list-tools", () => mcpListToolsAll());
  // Write gating is MAIN-OWNED (`mcp/server/callTool.ts` applies the org-composed
  // CONFIRMATION_POLICY on main's un-spoofable window). The old renderer-minted
  // `mcp:approve-write` token was a fail-open — a renderer XSS could self-approve —
  // and its channel is removed end to end, not just ignored.
  ipcMain.handle("mcp:call-tool", (_e, call: McpToolCall) => mcpCallTool(call));
  return () => controllers.size > 0;
}

// M-9: in a PACKAGED build with no OS keychain (a Linux box lacking libsecret /
// GNOME Keyring / KWallet, or a user who denied access), `safeStorage` can't
// encrypt — API keys, connector tokens, the auth session and the redaction VAULT
// fall back to base64 CLEARTEXT at rest (files are 0600 but readable off-disk).
// Warn the user ONCE so a distributable build doesn't silently store secrets
// unencrypted. Dev is unaffected (mock keychain / plaintext DB by design).
function warnIfNoAtRestEncryption(): void {
  if (!app.isPackaged || encryptionAvailable()) return;
  const marker = join(app.getPath("userData"), ".no-keychain-warned");
  if (existsSync(marker)) return;
  try {
    writeFileSync(marker, "1", { mode: 0o600 });
  } catch {
    /* best-effort — still show the warning */
  }
  void dialog.showMessageBox({
    type: "warning",
    title: "Chiffrement au repos indisponible",
    message: `${BRAND.name} n'a pas pu accéder au trousseau de votre système.`,
    detail:
      "Vos clés API, jetons de connexion, session et le coffre de redaction seront " +
      "stockés SANS chiffrement au repos sur cette machine (fichiers en 0600, mais " +
      "lisibles par quiconque accède au disque). Installez/déverrouillez un trousseau " +
      "(libsecret · GNOME Keyring · KWallet sur Linux) puis relancez pour l'activer.",
    buttons: ["Compris"],
  });
}

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
  // Point OCR at the bundled, sha256-pinned traineddata (audit M8) — no TOFU CDN fetch
  // into the native WASM parser on a packaged build. No-op in dev (CDN fallback).
  configureBundledOcr();
  configureBundledDoctr();
  installMediaPermissions(); // micro (dictée) : Electron refuse getUserMedia sans handler
  registerNotifyIpc(() => winRef); // bannière + clic qui ramène la fenêtre (./notify.ts)
  registerClaudeSkillsIpc(); // énumère ~/.claude/skills (./claudeSkills.ts)
  createWindow();
  warnIfNoAtRestEncryption(); // M-9: one-time notice if a packaged build has no keychain
  // Rallume le moteur NER quand l'utilisateur REVIENT sur l'app : le worker est évincé
  // après 10 min d'inactivité (RAM), et sans ceci le premier redaction d'après pause
  // repaie tout le chargement à froid pendant que l'utilisateur regarde le bouton
  // « Redaction » tourner. Couvre aussi le premier focus au lancement. No-op si chaud.
  app.on("browser-window-focus", () => warmLocalNer());
  // Agent-browser control surface (open/close the isolated agent window, point it
  // at a start URL). The window itself lives in a SEPARATE process, spawned on demand.
  registerBrowserIpc();
  // Forward the agent window's page (url + title) to the renderer so the browser
  // panel's tab reflects what's actually loaded (agent nav / URL bar / clicked link).
  setAgentTabsReporter((tabs) => {
    if (winRef && !winRef.isDestroyed()) winRef.webContents.send("browser:tabs", tabs);
  });
  // ⌘K (and future shortcuts) intercepted by the agent window while it has keyboard
  // focus → focus the main window + tell the renderer to open the palette. Opening the
  // palette mounts a modal, which the modal gate uses to hide the agent overlay.
  setAgentShortcutReporter((name) => {
    if (!winRef || winRef.isDestroyed()) return;
    winRef.focus();
    winRef.webContents.send("browser:shortcut", name);
  });
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
  installErrorReporting(() => winRef);
  // Auto-update via the apps/updates Worker feed + the in-app version picker's
  // IPC. `() => winRef` lets status events reach the current window. The 2nd arg is
  // the pre-install teardown: the app re-spawns ITSELF as extra Electron instances
  // (the agent browser + the @playwright/mcp server, same bundle id), and ShipIt
  // aborts the update swap while it still sees >1 running instance. So kill every
  // child instance — AWAITED — before quitAndInstall (mcpCloseAll takes the
  // playwright-mcp connector's child; stopAgentBrowser/stopBroker the others).
  setupAutoUpdates(() => winRef, {
    onBeforeInstall: async () => {
      await Promise.allSettled([mcpCloseAll(), stopAgentBrowser(), stopBroker()]);
    },
    // Route updater failures + a prior post-quit ShipIt failure into the $exception channel.
    reportError: (code, err) => reportMainError("updates", code, err),
    // …and the update funnel (check/downloaded/install/installed) into product events.
    reportEvent: (event) => reportMainEvent(event),
    // L'auto-installation en arrière-plan s'abstient tant qu'un flux chat:* est en vol.
    mainBusy: chatStreamsBusy,
  });
  // Cold start via the magic link on Windows/Linux: the URL is in our argv.
  // (macOS uses open-url; buffered until the renderer subscribes.)
  if (process.platform !== "darwin") {
    deliverAuthUrl(process.argv.find((a) => a.startsWith(`${AUTH_SCHEME}://`)));
  }
  // Launch the local MCP broker sidecar (best-effort; non-blocking).
  startBroker().catch((err) => console.error("[broker] start failed:", err));
  // Push live MCP state changes to the renderer so a connector reconnected in the
  // background (below) stops showing as "disconnected" without a manual refresh.
  setMcpChangeNotifier(() => {
    if (winRef && !winRef.isDestroyed()) winRef.webContents.send("mcp:changed");
  });
  // The browsed folder changed on disk → the Bibliothèque re-lists it. Same shape as
  // `mcp:changed`: main pushes, the renderer re-fetches.
  setLocalFsChangeNotifier((path) => {
    if (winRef && !winRef.isDestroyed()) winRef.webContents.send("localfs:changed", path);
  });
  // A remote connector whose backend dropped the transport is torn down in main and
  // reported here so the renderer can show a bottom "reconnexion nécessaire" banner.
  setMcpNeedsReconnectNotifier((items) => {
    if (winRef && !winRef.isDestroyed()) winRef.webContents.send("mcp:needs-reconnect", items);
  });
  // The OAuth authorize URL of an in-flight connect → the renderer's "Copier le lien"
  // (open the login in another browser than the default `shell.openExternal` picked).
  setMcpOauthUrlNotifier((id, url) => {
    if (winRef && !winRef.isDestroyed()) winRef.webContents.send("mcp:oauth-url", { id, url });
  });
  // Ask the renderer (styled in-app modal) which access mode to use for a
  // dual-mode connector (Firecrawl…): the user's account vs anonymous. Replaces
  // the native OS popup. A destroyed window / no reply falls back to "anonymous".
  setMcpAuthChoiceAsker(
    (req) =>
      new Promise<McpAuthChoice>((resolve) => {
        const win = winRef;
        if (!win || win.isDestroyed()) return resolve("anonymous");
        const requestId = `mcp-auth-${++authChoiceSeq}`;
        let settled = false;
        const done = (choice: McpAuthChoice) => {
          if (settled) return;
          settled = true;
          ipcMain.removeListener(`mcp:auth-choice-reply:${requestId}`, onReply);
          win.webContents.removeListener("destroyed", onGone);
          resolve(choice);
        };
        const onReply = (_e: unknown, choice: unknown) =>
          done(choice === "account" ? "account" : "anonymous");
        const onGone = () => done("anonymous");
        ipcMain.once(`mcp:auth-choice-reply:${requestId}`, onReply);
        win.webContents.once("destroyed", onGone);
        win.webContents.send("mcp:auth-choice", { requestId, id: req.id, name: req.name });
      }),
  );
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
  // Land the last debounce window of the egress journal. Best-effort like the rest of this
  // handler: losing a few seconds of the record on a hard kill is acceptable — nothing else
  // depends on it, it is evidence for the user.
  void flushEgressJournal();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
