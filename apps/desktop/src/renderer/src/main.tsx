import React from "react";
import ReactDOM from "react-dom/client";
import { initSentryRenderer } from "../../sentry/renderer";
import { fileSourceSlots } from "./host/fileSources";
import { envSlot } from "./host/envSlot";
import {
  HostProvider,
  configureAnalytics,
  configurePlatformAccess,
  captureError,
  captureEvent,
  setAnalyticsSuspended,
  setStableIdSource,
  applyPersistedTheme,
  type Host,
  type TrackEvent,
} from "@openmasq/ui";
import "@openmasq/ui/styles.css";
import { App } from "./App";
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
import { avisHost } from "./avis";
// THE renderer's environment reader — only one place reads `import.meta.env`,
// and that's where the runtime environment switch will go through (see `./appEnv`).
import {
  ADMIN_URL,
  ANALYTICS_DEBUG,
  ANALYTICS_RELAY_URL,
  BACKEND_CONFIGURED,
  BILLING_SOLD,
  GATEWAY_CONFIGURED,
  RELEASE_NOTES_URL,
  UPDATES_CONFIGURED,
  APP_VERSION,
  BUILD_ENV,
  REDACT_FN_URL,
  RUNTIME_ENV,
} from "./appEnv";

// Before everything else: an error during renderer bootstrap is precisely
// the one you can't reproduce.
initSentryRenderer();

// Wire opt-in usage analytics + error tracking through the FIRST-PARTY RELAY ONLY.
// The desktop NEVER holds a PostHog key: it POSTs the neutral envelope to the relay
// (apps/analytics-fn), which forwards to PostHog with its OWN server-side key. We
// deliberately do NOT pass `key`/`apiHost` here so `VITE_POSTHOG_KEY` is never
// referenced → never inlined in the shipped bundle, regardless of the build env.
// The URLs and their defaults live in `./appEnv`. Sending stays subject to in-app
// consent (+ Do-Not-Track): nothing here touches the privacy gate.
// SERVED = gateway + accounts; SOLD = `OPENMASQ_BILLING=1` (the gate for remote
// addresses at build time — `appEnv.ts` BILLING_SOLD). An entered stack serves without selling.
configurePlatformAccess({
  served: GATEWAY_CONFIGURED && AUTH_CONFIGURED,
  sold: BILLING_SOLD && SYNC_ENABLED,
});

configureAnalytics({
  relayUrl: ANALYTICS_RELAY_URL,
  source: "desktop",
  // La session Supabase authentifie la requête vers le relais — PARESSEUSE, et ce qu'elle
  // coûte hors session : `@openmasq/analytics` types.ts, `getAuthToken`.
  getAuthToken: () => authHost.getAccessToken?.() ?? Promise.resolve(null),
  // Stamps env + version on every event (`./appEnv` explains the derivation, and why
  // "empty" does NOT mean production). ⚠️ `runtimeEnv` is the SECOND axis, stamped nowhere
  // else: reserved for FLAGS, because a prod binary switched to staging stays
  // `BUILD_ENV: "production"` (`@openmasq/analytics` types.ts).
  env: BUILD_ENV,
  runtimeEnv: RUNTIME_ENV,
  appVersion: APP_VERSION,
  // Logs every event (sent / skipped + reason) in dev; VITE_POSTHOG_DEBUG=1 also opens it on a package.
  debug: ANALYTICS_DEBUG,
});

// The STABLE ID: the `installId` from `updates.json`, a per-machine uuid that survives a
// wiped profile — without which a fresh localStorage recreates a "person" every time
// (measured: 277 out of 278 production identities had lived only one day).
//
// ⚠️ We DECLARE the source, we no longer push the value. The pushed version ran in
// parallel with startup and bet that the sink's queue would last longer
// than this IPC round trip; losing that bet — or `current()` failing — would carve in a
// definitive `anon-…`, adoption never overwriting anything. Here the sink AWAITS `getAnonId()`,
// so no event can leave before the question is settled. The detail of the
// three cases is in `@openmasq/ui` `analytics/posthog.ts`.
setStableIdSource(async () => (await window.openmasq.updates?.current?.())?.installId);

// Safeguard against NON-HUMAN launches, the top source of noise in the
// numbers: the truth comes from MAIN (`OPENMASQ_E2E` at launch), the renderer can't
// claim it for itself — a spec driving the built app no longer emits anything. Not a
// race: nothing leaves before consent is settled (the settings effect),
// well after this IPC round trip.
void window.openmasq.env
  ?.isE2e?.()
  .then((on) => {
    if (on) setAnalyticsSuspended(true);
  })
  .catch(() => {});

// Error tracking: route ANY uncaught renderer error / unhandled rejection to the
// SEPARATE `$exception` channel (not the product-events stream). Anonymised — the
// message is scrubbed of PII by `captureError`, and it's gated by the same consent.
window.addEventListener("error", (ev) => {
  captureError({
    scope: "uncaught",
    code: "window-error",
    name: (ev.error as Error | undefined)?.name,
    message: (ev.error as Error | undefined)?.message || ev.message,
    fatal: true,
  });
});
window.addEventListener("unhandledrejection", (ev) => {
  const r = ev.reason as { name?: string; message?: string } | undefined;
  captureError({
    scope: "uncaught",
    code: "unhandled-rejection",
    name: r?.name,
    message: r?.message || String(ev.reason),
    fatal: true,
  });
});
// Main-process errors, forwarded over IPC → the same anonymised channel (the
// message is scrubbed by `captureError` before it leaves the machine).
window.openmasq.onAppError?.((e) => captureError(e));
// Main-process product events (the auto-update funnel — main is the only process that
// sees a check/download/install) through the SAME allow-listed, consent-gated choke
// point as a renderer event. Main emits against the `TrackEvent` catalogue too, so the
// cast just re-narrows what the IPC boundary widened.
window.openmasq.onAppEvent?.((e) => captureEvent(e as TrackEvent));

// The desktop platform implementation of the UI's Host interface: it simply
// forwards to the Electron preload bridge (window.openmasq). A mobile shell
// would provide its own Host here instead.
const host: Host = {
  startChat: (payload, handlers) => window.openmasq.startChat(payload, handlers),
  app: {
    versions: () => window.openmasq.app.versions(),
  },
  // Guarded so an un-restarted dev preload (no `media` namespace) degrades to
  // recording directly rather than throwing.
  media: window.openmasq.media
    ? { ensureMicAccess: () => window.openmasq.media.ensureMicAccess() }
    : undefined,
  // System notification when a reply arrives out of view. Guarded like
  // `media`: an un-restarted preload (dev) must degrade to "no banner", and the
  // setting disappears on its own along with the slot.
  notify: window.openmasq.notify
    ? {
        supported: () => window.openmasq.notify.supported(),
        reply: (input) => window.openmasq.notify.reply(input),
        onActivate: (cb) => window.openmasq.notify.onActivate(cb),
      }
    : undefined,
  claudeSkills: undefined, // ⛔ Claude Code import DISABLED — the switch, see CLAUDE.md
  // OpenGraph link-unfurl (opt-in via Settings.linkPreviews). Guarded like `media`.
  links: window.openmasq.links
    ? {
        preview: (url) => window.openmasq.links.preview(url),
        // Forward the opt-in to main (audit M4). Optional-chained so an un-restarted
        // preload (no `setEnabled`) degrades gracefully rather than throwing.
        setEnabled: (on) => window.openmasq.links.setEnabled?.(on) ?? Promise.resolve(),
      }
    : undefined,
  // Sandboxed Python (code interpreter). Guarded so an un-restarted dev preload
  // (no `python` namespace) degrades to no code interpreter rather than throwing.
  python: window.openmasq.python
    ? { run: (code, onProgress) => window.openmasq.python.run(code, onProgress) }
    : undefined,
  // HTML→PDF for a generated document (isolated, script-less, network-less window in
  // main). Guarded so an un-restarted dev preload degrades to the pdf-lib exporter.
  pdf: window.openmasq.pdf
    ? { renderHtml: (doc) => window.openmasq.pdf.renderHtml(doc) }
    : undefined,
  // Batch web reader (`web_fetch_many`). Guarded so an un-restarted preload (no `web`
  // namespace) degrades to no batch reader rather than throwing.
  web: window.openmasq.web
    ? { fetchMany: (urls) => window.openmasq.web.fetchMany(urls) }
    : undefined,
  // Live OpenRouter model catalogue. Guarded so an un-restarted preload (no `models`
  // namespace) degrades to the static registry rather than throwing.
  models: window.openmasq.models
    ? { listOpenRouter: () => window.openmasq.models.listOpenRouter() }
    : undefined,
  // Auto-update controls (electron-updater ↔ the apps/updates Worker feed).
  // ⚠️ Two conditions: a feed provided at build time (otherwise there's NOTHING to query — no
  // update card, no version history, no notes) and an up-to-date preload
  // (a non-restarted dev degrades instead of throwing).
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
          // Guarded like the rest: an un-restarted preload without the probe degrades to
          // "never auto-install" (main fail-closes on silence), never a throw.
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
    // Guarded: an un-restarted preload predating the debug-journal persistence must
    // degrade to the memory-only ring, never throw on a missing bridge method.
    ...(window.openmasq.db.saveDebugJournal
      ? {
          saveDebugJournal: (json: string) => window.openmasq.db.saveDebugJournal(json),
          loadDebugJournal: () => window.openmasq.db.loadDebugJournal(),
        }
      : {}),
    // Same guard: an un-restarted preload predating the egress journal simply doesn't
    // draw the section (`host.db.listEgress` absent), rather than throwing.
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
    // Guarded: an un-restarted preload predating `query` would make every memory_search
    // throw — absence must degrade to the lexical search, never break it.
    ...(window.openmasq.memoryIndex.query
      ? { query: (text: string, k?: number) => window.openmasq.memoryIndex.query(text, k) }
      : {}),
  },
  ...fileSourceSlots(),
  files: {
    pick: () => window.openmasq.files.pick(),
    pickPaths: () => window.openmasq.files.pickPaths(),
    extract: (paths, onProgress) => window.openmasq.files.extract(paths, onProgress),
    // Guarded on the bridge's existence: an un-restarted preload degrades (no "Read
    // all") instead of throwing.
    extractAll: window.openmasq.files.extractAll
      ? (paths, onProgress) => window.openmasq.files.extractAll(paths, onProgress)
      : undefined,
    read: (path) => window.openmasq.files.read(path),
    extractBytes: (data, name, mime, onProgress) =>
      window.openmasq.files.extractBytes(data, name, mime, onProgress),
    // Feature-detected: an un-restarted preload simply yields no picker hint.
    pathForFile: window.openmasq.files.pathForFile
      ? (file: File) => window.openmasq.files.pathForFile!(file)
      : undefined,
    redactAndSave: (p) => window.openmasq.files.redactAndSave(p) as any,
    fetchUrl: (url) => window.openmasq.files.fetchUrl(url),
  },
  complete: (payload) => window.openmasq.complete(payload),
  // Present only when the preload exposes it — an un-restarted preload predating
  // this method leaves the local engine unavailable (the store falls back to the
  // pattern rules) rather than assigning a method that returns undefined.
  detectLocalPii: window.openmasq.detectLocalPii
    ? (payload) => window.openmasq.detectLocalPii!(payload)
    : undefined,
  probeLocalEndpoint: window.openmasq.probeLocalEndpoint
    ? (baseUrl) => window.openmasq.probeLocalEndpoint!(baseUrl)
    : undefined,
  // Same un-restarted-preload guard: absent ⇒ `claude-cli` isn't offered (fail-closed).
  probeClaudeCli: window.openmasq.probeClaudeCli
    ? () => window.openmasq.probeClaudeCli!()
    : undefined,
  probeCodexCli: window.openmasq.probeCodexCli ? () => window.openmasq.probeCodexCli!() : undefined,
  probeAntigravityCli: window.openmasq.probeAntigravityCli
    ? () => window.openmasq.probeAntigravityCli!()
    : undefined,
  completeTools: (payload) => window.openmasq.completeTools(payload) as any,
  // STREAMING tool turn (assistant text token-by-token). Optional-chained: an
  // un-restarted dev preload without it → the agentic loop falls back to the
  // non-streaming completeTools automatically.
  streamChatTools: window.openmasq.streamChatTools
    ? (payload, handlers) => window.openmasq.streamChatTools!(payload as any, handlers)
    : undefined,
  // Optional-chained: a preload that predates this method (e.g. an un-restarted
  // dev window — preload doesn't hot-reload) makes Stop a no-op instead of throwing.
  cancelTools: (requestId) => window.openmasq.cancelTools?.(requestId),
  mcp: {
    // Desktop main enforces its own un-spoofable write-confirmation window on every
    // mutating non-browser tool — the renderer's plain-write card would double-prompt.
    mainWriteGate: true,
    list: () => window.openmasq.mcp.list(),
    // The E2E-synced integrations DIRECTORY (other devices' connectors, config
    // only) — renderer-side sync client, not a preload namespace.
    syncedIntegrations: () => pullSyncedIntegrations(),
    catalog: () => window.openmasq.mcp.catalog(),
    broker: () => window.openmasq.mcp.broker(),
    add: (spec) => window.openmasq.mcp.add(spec),
    // Feature-detected: an un-restarted preload has no `addCustom`, and the UI must
    // then show no "Ajouter un serveur" affordance rather than a dead button.
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
    // Optional-chained: an un-restarted dev preload without it → MCP stays global (the
    // pre-fix behaviour) rather than crashing; a restarted preload gets per-account scoping.
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
    // Optional-chained: an un-restarted preload without it → the toggle hides and every
    // write keeps prompting (fail-closed).
    setWriteAutoApprove: window.openmasq.mcp.setWriteAutoApprove
      ? (enable) => window.openmasq.mcp.setWriteAutoApprove!(enable)
      : undefined,
    // Optional-chained: an un-restarted dev preload without it → no live refresh
    // (the UI still works, just needs a manual reopen to reflect a reconnect).
    onChanged: window.openmasq.mcp.onChanged
      ? (cb) => window.openmasq.mcp.onChanged!(cb)
      : undefined,
    onNeedsReconnect: window.openmasq.mcp.onNeedsReconnect
      ? (cb) => window.openmasq.mcp.onNeedsReconnect!(cb)
      : undefined,
    onOauthUrl: window.openmasq.mcp.onOauthUrl
      ? (cb) => window.openmasq.mcp.onOauthUrl!(cb)
      : undefined,
    // Optional-chained: absent on an un-restarted preload → main falls back to
    // anonymous access (no modal), so connecting still works.
    onAuthChoice: window.openmasq.mcp.onAuthChoice
      ? (handler) => window.openmasq.mcp.onAuthChoice!(handler)
      : undefined,
  },
  // Live view/control of the agent-browser window (the split-screen panel).
  // Optional-chained so an un-restarted preload without it just hides the split
  // toggle instead of throwing. `setBounds` takes a VIEWPORT rect and is
  // translated to SCREEN coordinates here — `window.screenX/Y` is the renderer
  // content-area's screen origin (points = CSS px on macOS), so the isolated
  // top-level agent window lands exactly over the panel's viewport region.
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
        // Guarded: an un-restarted preload without `setDriving` degrades to no halo.
        setDriving:
          typeof window.openmasq.browser.setDriving === "function"
            ? (on: boolean) => window.openmasq.browser!.setDriving!(on)
            : undefined,
        // Guarded so an un-restarted preload (older `browser` namespace without
        // `onTabs`) degrades gracefully rather than throwing on subscribe.
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
    // Re-scope the encrypted key store to the signed-in account — the store's userId effect
    // calls this ALONGSIDE db/mcp setUser. Missing it left `currentUid` unresolved in main:
    // keys held in memory only, never persisted, legacy `keys.enc` never adopted.
    // Two riders, one gesture: `setOrgCacheUser` (org policy doesn't inherit) and
    // the SYNC PASSPHRASE, which used to be DEVICE-scoped — the next account inherited the
    // previous one's E2E key (`main/store/CLAUDE.md`). `?.`: an un-restarted dev preload degrades.
    setUser: (userId) => (
      setOrgCacheUser(userId),
      void window.openmasq.sync?.setUser?.(userId),
      window.openmasq.keys.setUser(userId)
    ),
    configured: () => window.openmasq.keys.configured(),
    set: (id, value) => window.openmasq.keys.set(id, value),
    clear: (id) => window.openmasq.keys.clear(id),
    importLegacy: (map) => window.openmasq.keys.importLegacy(map),
    // Optional: an un-restarted preload may not carry it.
    ...(window.openmasq.keys.setOrgByoAllowed
      ? { setOrgByoAllowed: (a: boolean | null) => window.openmasq.keys.setOrgByoAllowed!(a) }
      : {}),
    // Guarded: an un-restarted preload predating the PKCE flow must hide the affordance
    // rather than reject on a missing bridge method.
    ...(window.openmasq.keys.connectOpenRouter
      ? { connectOpenRouter: () => window.openmasq.keys.connectOpenRouter() }
      : {}),
  },
  // Absent when no Supabase project is supplied at build time: the login gate
  // is skipped (`useAuth` enabled:false) and the app runs entirely locally — never
  // an auth client pointed at a default project (see `auth.ts` AUTH_CONFIGURED).
  auth: AUTH_CONFIGURED ? authHost : undefined,
  // The whole sync stack is REMOTE (devices, envelopes, org log): without a backend
  // the slot doesn't exist, so no "Your devices" tab, no ⌘K entry, no
  // passphrase card — rather than a screen with no one to talk to.
  sync: BACKEND_CONFIGURED ? syncHost : undefined,
  // Organization authorization (membership/role + allow-lists), read from the
  // sync backend; absent = solo app. `openAdmin` opens the web admin console in
  // the system browser (window.open → shell.openExternal, main's handler).
  org: SYNC_ENABLED
    ? {
        getProfile: getOrgProfile,
        openAdmin: () => window.open(ADMIN_URL, "_blank"),
      }
    : undefined,
  // Org SHARES (coffre/skills → org/team/person, under approval).
  orgShares: SYNC_ENABLED ? orgSharesHost : undefined,
  // Individual billing (backend + Stripe) — ONLY in a build that SELLS: this slot makes the Payment tab and every upsell exist.
  billing: SYNC_ENABLED && BILLING_SOLD ? billingHost : undefined,
  // "Your feedback" — to the backend; without it, the rail action isn't offered.
  avis: SYNC_ENABLED ? avisHost : undefined,
  // The gateway (apps/gateway) — cloud redaction AND inference for included models.
  // ABSENT when the build doesn't supply its address: the redaction engine remains
  // the machine's own (already the default) and the models served by the platform
  // become unavailable instead of failing on send (`platformServed`).
  ...(GATEWAY_CONFIGURED ? { redactFnUrl: REDACT_FN_URL, inferenceUrl: REDACT_FN_URL } : {}),
  // Release notes (Settings → Versions → "What's new"), served by the same
  // service as the analytics relay (`/release-notes`, read-only Contentful proxy).
  // Address derived ONCE in `appEnv`; absent ⇒ the panel says "unavailable"
  // and the version list stays there regardless.
  ...(RELEASE_NOTES_URL ? { releaseNotesUrl: RELEASE_NOTES_URL } : {}),
};

// macOS runs the window with `titleBarStyle: "hiddenInset"` (main/index.ts): the
// close/minimise/zoom "traffic lights" FLOAT over our top-left content, exactly where the
// brand mark sits. Stamp the OS on <html> so `@openmasq/ui` can inset the rail + sidebar
// below them — in CSS, and ONLY on the platform that has them (Windows/Linux draw a real
// title bar, so reserving the space there would just waste it). The UI package must stay
// platform-agnostic, so the sniff belongs here, in the desktop renderer.
if (navigator.userAgent.includes("Macintosh")) {
  document.documentElement.dataset.os = "mac";
}

// Theme <html> from the persisted device settings BEFORE the first render, so the
// AppIntro splash paints straight in the right theme — without this it renders once in
// the default (green) theme and snaps to blue on the store's post-mount effect (the flash).
applyPersistedTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HostProvider value={host}>
      <App />
    </HostProvider>
  </React.StrictMode>,
);

// Fade out + remove the pre-React boot splash (index.html) once the app has painted
// its first frame. A double rAF lands after React's initial commit + paint, so the
// handoff to the in-app AppIntro is seamless — no flash of empty shell, no splash
// lingering over the mounted UI.
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    const splash = document.getElementById("boot-splash");
    if (!splash) return;
    splash.classList.add("boot-hide");
    setTimeout(() => splash.remove(), 360);
  }),
);
