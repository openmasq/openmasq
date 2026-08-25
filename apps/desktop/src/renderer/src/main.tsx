import React from "react";
import ReactDOM from "react-dom/client";
import { initSentryRenderer } from "../../sentry/renderer";
import { fileSourceSlots } from "./host/fileSources";
import {
  HostProvider,
  configureAnalytics,
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
import { authHost } from "./auth";
import { backendFetch } from "./backendFetch";
import { syncHost, getOrgProfile, setOrgCacheUser, SYNC_ENABLED, pullSyncedIntegrations, orgSharesHost } from "./sync";
import { billingHost } from "./billing";
import { avisHost } from "./avis";
// LE lecteur d'environnement du renderer — un seul endroit lit `import.meta.env`,
// et c'est là que passera la bascule d'environnement à l'exécution (voir `./appEnv`).
import {
  ADMIN_URL,
  ANALYTICS_APP_KEY,
  ANALYTICS_DEBUG,
  ANALYTICS_RELAY_URL,
  APP_VERSION,
  BACKEND_URL,
  BUILD_ENV,
  REDACT_FN_URL,
  RUNTIME_ENV,
} from "./appEnv";

// Avant tout le reste : une erreur pendant l'amorçage du renderer est justement
// celle qu'on ne peut pas reproduire.
initSentryRenderer();

// Wire opt-in usage analytics + error tracking through the FIRST-PARTY RELAY ONLY.
// The desktop NEVER holds a PostHog key: it POSTs the neutral envelope to the relay
// (apps/analytics-fn), which forwards to PostHog with its OWN server-side key. We
// deliberately do NOT pass `key`/`apiHost` here so `VITE_POSTHOG_KEY` is never
// referenced → jamais inliné dans le bundle expédié, quel que soit l'env de build.
// Les URL et leurs défauts vivent dans `./appEnv`. L'envoi reste soumis au consentement
// in-app (+ Do-Not-Track) : rien ici ne touche la porte de confidentialité.
configureAnalytics({
  relayUrl: ANALYTICS_RELAY_URL,
  source: "desktop",
  // Attest the RELAY request with the build's HMAC key (anti-abuse only, NON-identity : le
  // relais vérifie que c'est un build officiel de l'app puis jette, donc les événements restent anonymes
  // et partent déconnecté aussi). Sans clé (dev) ⇒ pas d'en-tête, le relais accepte.
  appKey: ANALYTICS_APP_KEY,
  // Estampille env + version sur chaque événement (`./appEnv` dit la dérivation, et pourquoi
  // « vide » ne veut PAS dire production). ⚠️ `runtimeEnv` est le SECOND axe, estampillé nulle
  // part : réservé aux DRAPEAUX, parce qu'un binaire de prod basculé sur staging reste
  // `BUILD_ENV: "production"` (`@openmasq/analytics` types.ts).
  env: BUILD_ENV,
  runtimeEnv: RUNTIME_ENV,
  appVersion: APP_VERSION,
  // Journalise chaque événement (envoyé / ignoré + raison) en dev ; VITE_POSTHOG_DEBUG=1 l'ouvre aussi sur un paquet.
  debug: ANALYTICS_DEBUG,
});

// L'ID STABLE : l'`installId` d'`updates.json`, un uuid par machine qui survit à un
// profil vidé — sans quoi un localStorage neuf refait une « personne » à chaque fois
// (mesuré : 277 identités de production sur 278 n'avaient vécu qu'un seul jour).
//
// ⚠️ On DÉCLARE la source, on ne pousse plus la valeur. La version poussée partait en
// parallèle du démarrage et pariait que la file d'attente du sink durerait plus longtemps
// que cet aller-retour IPC ; perdre ce pari — ou voir `current()` échouer — gravait un
// `anon-…` définitif, l'adoption n'écrasant jamais rien. Ici le sink AWAIT `getAnonId()`,
// donc aucun événement ne peut partir avant que la question soit tranchée. Le détail des
// trois cas est dans `@openmasq/ui` `analytics/posthog.ts`.
setStableIdSource(async () => (await window.openmasq.updates?.current?.())?.installId);

// Garde-fou contre les lancements NON HUMAINS, la première source de bruit dans les
// chiffres : la vérité vient de MAIN (`OPENMASQ_E2E` au lancement), le renderer ne peut
// pas se l'attribuer — un spec qui pilote l'app construite n'émet plus rien. Pas une
// course : rien ne part avant que le consentement soit tranché (effet des réglages),
// bien après cet aller-retour IPC.
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
  startChat: (payload, handlers) =>
    window.openmasq.startChat(payload, handlers),
  app: {
    versions: () => window.openmasq.app.versions(),
  },
  // Guarded so an un-restarted dev preload (no `media` namespace) degrades to
  // recording directly rather than throwing.
  media: window.openmasq.media
    ? { ensureMicAccess: () => window.openmasq.media.ensureMicAccess() }
    : undefined,
  // Notification système quand une réponse arrive hors du champ de vision. Gardée comme
  // `media` : un preload non redémarré (dev) doit dégrader en « pas de bannière », et le
  // réglage disparaît de lui-même avec le créneau.
  notify: window.openmasq.notify
    ? {
        supported: () => window.openmasq.notify.supported(),
        reply: (input) => window.openmasq.notify.reply(input),
        onActivate: (cb) => window.openmasq.notify.onActivate(cb),
      }
    : undefined,
  claudeSkills: undefined, // ⛔ import Claude Code DÉSACTIVÉ — l'interrupteur, voir CLAUDE.md
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
  // Guarded so an un-restarted dev preload (no `updates` namespace) degrades to
  // no updates UI rather than throwing.
  updates: window.openmasq.updates
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
        // « jamais d'auto-install » (main fail-closes on silence), never a throw.
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
  // L'environnement d'exécution (production/staging) + sa bascule — la carte
  // « Environnement » de Réglages → Versions. Guarded : un preload non redémarré n'a
  // pas `env.switchTo` → pas de carte, jamais un throw. La DÉCISION est en main
  // (`registerEnvIpc`, fail-closed) ; ici on demande, et on porte le jeton du compte
  // pour que le backend de production réponde pour CE compte (drapeau staging_tester).
  env: window.openmasq.env?.switchTo
    ? {
        name: RUNTIME_ENV,
        switchTo: async (envName) => {
          const token = (await authHost.getAccessToken?.().catch(() => null)) ?? undefined;
          return window.openmasq.env.switchTo(envName, token);
        },
        // AFFICHAGE seulement (proposer ou non la bascule), fail-closed à false — la vraie
        // garde revit en main au moment de basculer, et BACKEND_URL est bien la production.
        stagingTester: async () => {
          try {
            const token = await authHost.getAccessToken?.();
            if (!token) return false;
            // `backendFetch`, jamais `fetch` : il porte l'identité du client — voir sa source.
            const res = await backendFetch(`${BACKEND_URL}/api-features/users/me/flags`, {
              headers: { authorization: `Bearer ${token}` },
            });
            if (!res.ok) return false;
            const body = (await res.json()) as { flags?: { staging_tester?: boolean } };
            return body?.flags?.staging_tester === true;
          } catch {
            return false;
          }
        },
      }
    : undefined,
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
    listFiles: (conversationId) =>
      window.openmasq.db.listFiles(conversationId) as any,
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
    // Gardé sur l'existence du pont : un preload non redémarré dégrade (pas de « Lire
    // tout ») au lieu de jeter.
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
    addStdio: (catalogId, env, params) =>
      window.openmasq.mcp.addStdio(catalogId, env, params),
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
        navigate: (url: string, tabId?: string) =>
          window.openmasq.browser!.navigate(url, tabId),
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
    // Deux passagers, même geste : `setOrgCacheUser` (la politique d'orga ne s'hérite pas) et
    // la PHRASE DE SYNCHRO, qui était à portée APPAREIL — le compte suivant héritait de la clé
    // E2E du précédent (`main/store/CLAUDE.md`). `?.` : un preload dev non redémarré dégrade.
    setUser: (userId) => (setOrgCacheUser(userId), void window.openmasq.sync?.setUser?.(userId), window.openmasq.keys.setUser(userId)),
    configured: () => window.openmasq.keys.configured(),
    set: (id, value) => window.openmasq.keys.set(id, value),
    clear: (id) => window.openmasq.keys.clear(id),
    importLegacy: (map) => window.openmasq.keys.importLegacy(map),
    // Optionnel : un preload non redémarré peut ne pas la porter.
    ...(window.openmasq.keys.setOrgByoAllowed
      ? { setOrgByoAllowed: (a: boolean | null) => window.openmasq.keys.setOrgByoAllowed!(a) }
      : {}),
    // Guarded: an un-restarted preload predating the PKCE flow must hide the affordance
    // rather than reject on a missing bridge method.
    ...(window.openmasq.keys.connectOpenRouter
      ? { connectOpenRouter: () => window.openmasq.keys.connectOpenRouter() }
      : {}),
  },
  auth: authHost,
  sync: syncHost,
  // Organization authorization (membership/role + allow-lists), read from the
  // sync backend; absent = solo app. `openAdmin` opens the web admin console in
  // the system browser (window.open → shell.openExternal, main's handler).
  org: SYNC_ENABLED
    ? {
        getProfile: getOrgProfile,
        openAdmin: () =>
          window.open(
            ADMIN_URL,
            "_blank",
          ),
      }
    : undefined,
  // Org SHARES (coffre/compétences → org/équipe/personne, sous approbation).
  orgShares: SYNC_ENABLED ? orgSharesHost : undefined,
  // Individual (per-person) billing — subscription + prepaid credits + Stripe
  // checkout/portal, backed by the backend /subscriptions/* with the auth token.
  billing: SYNC_ENABLED ? billingHost : undefined,
  // "Votre avis" — posts the user's feedback to the backend, which emails it to the
  // team. Gated on the SAME backend-configured flag as billing/org: with no backend
  // there is nowhere to send it, so the rail action is not offered at all rather
  // than offered and dead.
  avis: SYNC_ENABLED ? avisHost : undefined,
  // Optional build-time override of the remote redaction function URL
  // (apps/gateway). Unset is normal — the store falls back to the baked-in
  // DEFAULT_REDACT_FN_URL (the cloud engine is automatic, a paid-plan feature).
  redactFnUrl: REDACT_FN_URL,
  // OpenAI-compatible inference proxy for PLATFORM-provided models (Scaleway on
  // the app's own key + prepaid credits). It's the SAME redact-fn CONTAINER (it serves
  // redaction at `/` and inference at `/chat/completions`) — the held-open stream
  // belongs on the scalable container, not the Vercel backend. The OpenAI client
  // posts `${inferenceUrl}/chat/completions`; credits are metered by that CONTAINER
  // itself (direct SQL to the shared DB) — so this URL MUST point at the same
  // environment's gateway as VITE_BACKEND_URL, or the meter writes to a different
  // DB than the one the org "usage" endpoint reads (→ credits appear stuck at 0).
  inferenceUrl: REDACT_FN_URL,
  // Release-notes endpoint for Settings → Versions ("Nouveautés"). Derived from the
  // analytics-fn base: VITE_ANALYTICS_RELAY_URL is `<host>/e`; strip the `/e` and
  // point at `/release-notes` on the same first-party function. FALLS BACK to the
  // production analytics host when the build didn't bake the env var (a STAGING build
  // whose `vars.ANALYTICS_RELAY_URL` was empty showed the version list but NO notes) —
  // analytics-fn is deployed ONCE for all envs at this stable host (root CLAUDE.md), and
  // /release-notes is a read-only Contentful proxy, so a default is safe (mirrors
  // `updates.ts` `DEFAULT_UPDATES_URL`). Notes are env-agnostic Contentful content.
  releaseNotesUrl: `${ANALYTICS_RELAY_URL.replace(/\/e\/?$/, "")}/release-notes`,
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
