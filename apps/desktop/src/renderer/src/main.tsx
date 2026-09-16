import React from "react";
import ReactDOM from "react-dom/client";
import { fileSourceSlots } from "./host/fileSources";
import { envSlot } from "./host/envSlot";
import { HostProvider, applyPersistedTheme, type Host } from "@openmasq/ui";
import "@openmasq/ui/styles.css";
import { App } from "./App";
import { initRendererTelemetry } from "./telemetry";
import { AUTH_CONFIGURED, authHost } from "./auth";
import {
  syncHost,
  getOrgProfile,
  setOrgCacheUser,
  SYNC_ENABLED,
  pullSyncedIntegrations,
  orgSharesHost,
} from "./sync";
import { billingHost } from "./billing";
import { feedbackHost, mailtoFeedbackHost } from "./feedback";
// THE renderer's environment reader (`./appEnv`).
import {
  ADMIN_URL,
  BACKEND_CONFIGURED,
  BILLING_SOLD,
  GATEWAY_CONFIGURED,
  RELEASE_NOTES_URL,
  UPDATES_CONFIGURED,
  REDACT_FN_URL,
} from "./appEnv";

// Telemetry FIRST: an error during bootstrap is the one you can't reproduce.
initRendererTelemetry();

// The desktop implementation of the UI's Host: forwards to the preload bridge
// (window.openmasq). Every optional slot is GUARDED on the bridge method's existence,
// so an un-restarted dev preload (it doesn't hot-reload) degrades instead of throwing.
const host: Host = {
  startChat: (payload, handlers) => window.openmasq.startChat(payload, handlers),
  app: {
    versions: () => window.openmasq.app.versions(),
  },
  media: window.openmasq.media
    ? { ensureMicAccess: () => window.openmasq.media.ensureMicAccess() }
    : undefined,
  // System notification when a reply arrives out of view.
  notify: window.openmasq.notify
    ? {
        supported: () => window.openmasq.notify.supported(),
        reply: (input) => window.openmasq.notify.reply(input),
        onActivate: (cb) => window.openmasq.notify.onActivate(cb),
      }
    : undefined,
  claudeSkills: undefined, // ⛔ Claude Code import DISABLED — the switch, see CLAUDE.md
  // Link-unfurl (opt-in via Settings.linkPreviews); the opt-in is forwarded to main.
  links: window.openmasq.links
    ? {
        preview: (url) => window.openmasq.links.preview(url),
        setEnabled: (on) => window.openmasq.links.setEnabled?.(on) ?? Promise.resolve(),
      }
    : undefined,
  python: window.openmasq.python
    ? { run: (code, onProgress) => window.openmasq.python.run(code, onProgress) }
    : undefined,
  // Absent ⇒ the pdf-lib exporter.
  pdf: window.openmasq.pdf
    ? { renderHtml: (doc) => window.openmasq.pdf.renderHtml(doc) }
    : undefined,
  web: window.openmasq.web
    ? { fetchMany: (urls) => window.openmasq.web.fetchMany(urls) }
    : undefined,
  // Absent ⇒ the static registry.
  models: window.openmasq.models
    ? {
        listOpenRouter: () => window.openmasq.models.listOpenRouter(),
        listLocal: (u) => window.openmasq.models.listLocal?.(u) ?? Promise.resolve([]),
      }
    : undefined,
  // Auto-update controls. Two conditions: a feed provided at build time (otherwise
  // there is NOTHING to query) and an up-to-date preload.
  updates:
    UPDATES_CONFIGURED && window.openmasq.updates
      ? {
          current: () => window.openmasq.updates.current(),
          revealLog: window.openmasq.updates.revealLog
            ? () => window.openmasq.updates.revealLog!()
            : undefined,
          list: () => window.openmasq.updates.list(),
          permissions: () => window.openmasq.updates.permissions(),
          check: () => window.openmasq.updates.check(),
          pin: (version) => window.openmasq.updates.pin(version),
          setChannel: (channel) => window.openmasq.updates.setChannel(channel),
          listAll: () => window.openmasq.updates.listAll(),
          switchTo: (arg) => window.openmasq.updates.switchTo(arg),
          install: () => window.openmasq.updates.install(),
          onStatus: (cb) => window.openmasq.updates.onStatus(cb),
          // Absent ⇒ "never auto-install" (main fail-closes on silence).
          ...(window.openmasq.updates.onQuiescenceAsk
            ? {
                onQuiescenceAsk: (cb: (askId: string) => void) =>
                  window.openmasq.updates.onQuiescenceAsk(cb),
                replyQuiescence: (askId: string, busy: boolean) =>
                  window.openmasq.updates.replyQuiescence(askId, busy),
              }
            : {}),
        }
      : undefined,
  env: envSlot(),
  db: {
    configured: () => window.openmasq.db.configured(),
    setUser: (userId) => window.openmasq.db.setUser(userId),
    load: () => window.openmasq.db.load() as any,
    saveConversation: (conv) => window.openmasq.db.saveConversation(conv),
    deleteConversation: (id) => window.openmasq.db.deleteConversation(id),
    saveSettings: (settings) => window.openmasq.db.saveSettings(settings),
    // Absent ⇒ the memory-only ring.
    ...(window.openmasq.db.saveDebugJournal
      ? {
          saveDebugJournal: (json: string) => window.openmasq.db.saveDebugJournal(json),
          loadDebugJournal: () => window.openmasq.db.loadDebugJournal(),
        }
      : {}),
    // Absent ⇒ the egress section isn't drawn.
    ...(window.openmasq.db.listEgress
      ? { listEgress: (limit?: number) => window.openmasq.db.listEgress(limit) }
      : {}),
    saveFile: (file) => window.openmasq.db.saveFile(file as any),
    listFiles: (conversationId) => window.openmasq.db.listFiles(conversationId) as any,
    loadFile: (id) => window.openmasq.db.loadFile(id) as any,
    deleteFile: (id) => window.openmasq.db.deleteFile(id),
    conversationsForFile: (hash) => window.openmasq.db.conversationsForFile(hash),
    openFile: (id) => window.openmasq.db.openFile(id),
  },
  embeddings: {
    index: (payload) => window.openmasq.embeddings.index(payload),
    search: (payload) => window.openmasq.embeddings.search(payload),
  },
  memoryIndex: {
    sync: (cards) => window.openmasq.memoryIndex.sync(cards),
    edges: (k) => window.openmasq.memoryIndex.edges(k),
    // Absent ⇒ the lexical search.
    ...(window.openmasq.memoryIndex.query
      ? { query: (text: string, k?: number) => window.openmasq.memoryIndex.query(text, k) }
      : {}),
  },
  ...fileSourceSlots(),
  files: {
    pick: () => window.openmasq.files.pick(),
    pickPaths: () => window.openmasq.files.pickPaths(),
    extract: (paths, onProgress) => window.openmasq.files.extract(paths, onProgress),
    // Absent ⇒ no "Read all".
    extractAll: window.openmasq.files.extractAll
      ? (paths, onProgress) => window.openmasq.files.extractAll(paths, onProgress)
      : undefined,
    read: (path) => window.openmasq.files.read(path),
    extractBytes: (data, name, mime, onProgress) =>
      window.openmasq.files.extractBytes(data, name, mime, onProgress),
    // Absent ⇒ no picker hint.
    pathForFile: window.openmasq.files.pathForFile
      ? (file: File) => window.openmasq.files.pathForFile!(file)
      : undefined,
    redactAndSave: (p) => window.openmasq.files.redactAndSave(p) as any,
    fetchUrl: (url) => window.openmasq.files.fetchUrl(url),
  },
  complete: (payload) => window.openmasq.complete(payload),
  // Absent ⇒ the local engine is unavailable (the store falls back to the pattern rules).
  detectLocalPii: window.openmasq.detectLocalPii
    ? (payload) => window.openmasq.detectLocalPii!(payload)
    : undefined,
  probeLocalEndpoint: window.openmasq.probeLocalEndpoint
    ? (baseUrl) => window.openmasq.probeLocalEndpoint!(baseUrl)
    : undefined,
  // Absent ⇒ `claude-cli` isn't offered (fail-closed).
  probeClaudeCli: window.openmasq.probeClaudeCli
    ? () => window.openmasq.probeClaudeCli!()
    : undefined,
  probeCodexCli: window.openmasq.probeCodexCli ? () => window.openmasq.probeCodexCli!() : undefined,
  probeAntigravityCli: window.openmasq.probeAntigravityCli
    ? () => window.openmasq.probeAntigravityCli!()
    : undefined,
  readSubscriptionAccount: window.openmasq.readSubscriptionAccount
    ? (cli) => window.openmasq.readSubscriptionAccount!(cli)
    : undefined,
  setSubscriptionEnabled: window.openmasq.setSubscriptionEnabled
    ? (cli, on) => window.openmasq.setSubscriptionEnabled!(cli, on)
    : undefined,
  completeTools: (payload) => window.openmasq.completeTools(payload) as any,
  // STREAMING tool turn; absent ⇒ the agentic loop falls back to completeTools.
  streamChatTools: window.openmasq.streamChatTools
    ? (payload, handlers) => window.openmasq.streamChatTools!(payload as any, handlers)
    : undefined,
  // Absent ⇒ Stop is a no-op.
  cancelTools: (requestId) => window.openmasq.cancelTools?.(requestId),
  mcp: {
    // Main enforces its own un-spoofable write-confirmation window; the renderer's
    // plain-write card would double-prompt.
    mainWriteGate: true,
    list: () => window.openmasq.mcp.list(),
    // The E2E-synced integrations DIRECTORY (config only), a renderer-side sync client.
    syncedIntegrations: () => pullSyncedIntegrations(),
    catalog: () => window.openmasq.mcp.catalog(),
    broker: () => window.openmasq.mcp.broker(),
    add: (spec) => window.openmasq.mcp.add(spec),
    // Absent ⇒ no "Ajouter un serveur" affordance rather than a dead button.
    addCustom: window.openmasq.mcp.addCustom
      ? (input) => window.openmasq.mcp.addCustom!(input)
      : undefined,
    addStdio: (catalogId, env, params) => window.openmasq.mcp.addStdio(catalogId, env, params),
    pickDir: (hint) => window.openmasq.mcp.pickDir(hint),
    setDirs: (id, key, dirs) => window.openmasq.mcp.setDirs(id, key, dirs),
    remove: (id) => window.openmasq.mcp.remove(id),
    connect: (id) => window.openmasq.mcp.connect(id),
    connectDirect: (id, opts) => window.openmasq.mcp.connectDirect(id, opts),
    addAccountDirect: window.openmasq.mcp.addAccountDirect
      ? (id, opts) => window.openmasq.mcp.addAccountDirect!(id, opts)
      : undefined,
    addAccountRemote: window.openmasq.mcp.addAccountRemote
      ? (id, opts) => window.openmasq.mcp.addAccountRemote!(id, opts)
      : undefined,
    reauthDirect: (id) => window.openmasq.mcp.reauthDirect(id),
    byoCredGroups: window.openmasq.mcp.byoCredGroups
      ? () => window.openmasq.mcp.byoCredGroups!()
      : undefined,
    disconnect: (id) => window.openmasq.mcp.disconnect(id),
    enableBrowser: window.openmasq.mcp.enableBrowser
      ? () => window.openmasq.mcp.enableBrowser!()
      : undefined,
    disableBrowser: window.openmasq.mcp.disableBrowser
      ? () => window.openmasq.mcp.disableBrowser!()
      : undefined,
    // Absent ⇒ MCP stays global rather than per-account.
    setUser: window.openmasq.mcp.setUser
      ? (userId) => window.openmasq.mcp.setUser!(userId)
      : undefined,
    setOrgConfirmationFloor: window.openmasq.mcp.setOrgConfirmationFloor
      ? (floor) => window.openmasq.mcp.setOrgConfirmationFloor!(floor)
      : undefined,
    setOrgAllowedConnectors: window.openmasq.mcp.setOrgAllowedConnectors
      ? (ids) => window.openmasq.mcp.setOrgAllowedConnectors!(ids)
      : undefined,
    listTools: () => window.openmasq.mcp.listTools(),
    callTool: (call) => window.openmasq.mcp.callTool(call),
    // Absent ⇒ the toggle hides and every write keeps prompting (fail-closed).
    setWriteAutoApprove: window.openmasq.mcp.setWriteAutoApprove
      ? (enable) => window.openmasq.mcp.setWriteAutoApprove!(enable)
      : undefined,
    // Absent ⇒ no live refresh.
    onChanged: window.openmasq.mcp.onChanged
      ? (cb) => window.openmasq.mcp.onChanged!(cb)
      : undefined,
    onNeedsReconnect: window.openmasq.mcp.onNeedsReconnect
      ? (cb) => window.openmasq.mcp.onNeedsReconnect!(cb)
      : undefined,
    onOauthUrl: window.openmasq.mcp.onOauthUrl
      ? (cb) => window.openmasq.mcp.onOauthUrl!(cb)
      : undefined,
    // Absent ⇒ main falls back to anonymous access (no modal).
    onAuthChoice: window.openmasq.mcp.onAuthChoice
      ? (handler) => window.openmasq.mcp.onAuthChoice!(handler)
      : undefined,
  },
  // The agent-browser window (the split-screen panel). `setBounds` takes a VIEWPORT rect,
  // translated to SCREEN coordinates here (`window.screenX/Y` is the content-area's
  // screen origin), so the top-level agent window lands exactly over the panel.
  browser: window.openmasq.browser
    ? {
        status: () => window.openmasq.browser!.status(),
        show: () => window.openmasq.browser!.show(),
        hide: () => window.openmasq.browser!.hide(),
        navigate: (url: string, tabId?: string) => window.openmasq.browser!.navigate(url, tabId),
        tabNew:
          typeof window.openmasq.browser.tabNew === "function"
            ? (url?: string) => window.openmasq.browser!.tabNew!(url)
            : undefined,
        tabSelect:
          typeof window.openmasq.browser.tabSelect === "function"
            ? (id: string) => window.openmasq.browser!.tabSelect!(id)
            : undefined,
        tabClose:
          typeof window.openmasq.browser.tabClose === "function"
            ? (id: string) => window.openmasq.browser!.tabClose!(id)
            : undefined,
        goBack:
          typeof window.openmasq.browser.goBack === "function"
            ? () => window.openmasq.browser!.goBack!()
            : undefined,
        goForward:
          typeof window.openmasq.browser.goForward === "function"
            ? () => window.openmasq.browser!.goForward!()
            : undefined,
        setBounds: (r) =>
          window.openmasq.browser!.setBounds({
            x: Math.round(window.screenX + r.x),
            y: Math.round(window.screenY + r.y),
            width: Math.round(r.width),
            height: Math.round(r.height),
          }),
        setDriving:
          typeof window.openmasq.browser.setDriving === "function"
            ? (on: boolean) => window.openmasq.browser!.setDriving!(on)
            : undefined,
        onTabs:
          typeof window.openmasq.browser.onTabs === "function"
            ? (cb) => window.openmasq.browser!.onTabs!(cb)
            : undefined,
        onShortcut:
          typeof window.openmasq.browser.onShortcut === "function"
            ? (cb) => window.openmasq.browser!.onShortcut!(cb)
            : undefined,
      }
    : undefined,
  keys: {
    // Re-scope the encrypted key store to the signed-in account, alongside db/mcp
    // setUser. Two riders, one gesture: the org cache and the SYNC PASSPHRASE, both
    // account-scoped so the next account inherits nothing (`main/store/CLAUDE.md`).
    setUser: (userId) => (
      setOrgCacheUser(userId),
      void window.openmasq.sync?.setUser?.(userId),
      window.openmasq.keys.setUser(userId)
    ),
    configured: () => window.openmasq.keys.configured(),
    set: (id, value) => window.openmasq.keys.set(id, value),
    clear: (id) => window.openmasq.keys.clear(id),
    importLegacy: (map) => window.openmasq.keys.importLegacy(map),
    ...(window.openmasq.keys.setOrgByoAllowed
      ? { setOrgByoAllowed: (a: boolean | null) => window.openmasq.keys.setOrgByoAllowed!(a) }
      : {}),
    // Absent ⇒ the affordance is hidden.
    ...(window.openmasq.keys.connectOpenRouter
      ? { connectOpenRouter: () => window.openmasq.keys.connectOpenRouter() }
      : {}),
  },
  // Absent when no auth server is supplied at build time: the login gate is skipped and
  // the app runs entirely locally, never an auth client pointed at a default project.
  auth: AUTH_CONFIGURED ? authHost : undefined,
  // The whole sync stack is REMOTE: without an API the slot doesn't exist, rather than a
  // screen with no one to talk to.
  sync: BACKEND_CONFIGURED ? syncHost : undefined,
  // Organization authorization, read from the API; absent = solo app. `openAdmin` opens
  // the admin site in the system browser (window.open → main's handler).
  org: SYNC_ENABLED
    ? {
        getProfile: getOrgProfile,
        openAdmin: () => window.open(ADMIN_URL, "_blank"),
      }
    : undefined,
  // Org SHARES (coffre/skills → org/team/person, under approval).
  orgShares: SYNC_ENABLED ? orgSharesHost : undefined,
  // Individual billing, ONLY in a build that SELLS: this slot makes the Payment tab exist.
  billing: SYNC_ENABLED && BILLING_SOLD ? billingHost : undefined,
  // "Your feedback": the API, or the user's mail client (the modal reads `kind`).
  feedback: SYNC_ENABLED ? feedbackHost : mailtoFeedbackHost,
  // The gateway: cloud redaction AND inference for included models. ABSENT ⇒ the
  // platform-served models become unavailable instead of failing on send.
  ...(GATEWAY_CONFIGURED ? { redactFnUrl: REDACT_FN_URL, inferenceUrl: REDACT_FN_URL } : {}),
  // Release notes (Settings → Versions); absent ⇒ the panel says "unavailable".
  ...(RELEASE_NOTES_URL ? { releaseNotesUrl: RELEASE_NOTES_URL } : {}),
};

// macOS traffic lights FLOAT over our top-left content (`hiddenInset`): stamp the OS on
// <html> so the UI insets the rail in CSS, ONLY on the platform that has them. The UI
// package stays platform-agnostic, so the sniff lives here.
if (navigator.userAgent.includes("Macintosh")) {
  document.documentElement.dataset.os = "mac";
}

// Theme <html> BEFORE the first render, so the splash paints in the right theme.
applyPersistedTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HostProvider value={host}>
      <App />
    </HostProvider>
  </React.StrictMode>,
);

// Remove the pre-React boot splash after the first paint (a double rAF lands after
// React's initial commit + paint).
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    const splash = document.getElementById("boot-splash");
    if (!splash) return;
    splash.classList.add("boot-hide");
    setTimeout(() => splash.remove(), 360);
  }),
);
