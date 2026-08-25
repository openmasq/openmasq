import { DEVTOOLS_PREF } from "../../devtools";
import {
  app,
  BaseWindow,
  WebContentsView,
  session,
  type Rectangle,
  type WebContents,
} from "electron";
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";
import { assertPublicUrl, isPrivateIp } from "../../net/net";
import { fetchFaviconDataUrl } from "../../net/favicon";
import { FIREFOX_UA, LOGIN_PRELOAD, STEALTH_PRELOAD } from "../../browserSession";
import { CONSENT_DISMISS_JS } from "./consentDismiss"; import { BRAND } from "@openmasq/branding";

// ── Isolated agent-browser process (MULTI-TAB) ───────────────────────────────
// SECURITY: the model drives a browser over CDP, but CDP is process-global — in
// the MAIN app process it would also expose the React UI page (which holds
// `window.openmasq` = full IPC). So the agent browser runs in THIS separate
// Electron process (the SAME app binary re-spawned with OPENMASQ_AGENT_BROWSER=1),
// hosting ONLY agent pages. Its CDP endpoint therefore exposes only agent tabs —
// none is the app UI, so multi-tab is safe: every tab is untrusted web content with
// NO IPC access. The MAIN app never opens CDP.
//
// TABS: a `BaseWindow` (no webContents of its own → no stray CDP target) holds one
// `WebContentsView` per tab. Only the active view is visible (others kept ALIVE +
// hidden → instant switch, no reload). Each view's webContents is automatically a
// CDP target, so @playwright/mcp can list/select/act across tabs. The per-webContents
// security guards (navigation SSRF, popups→new tab, ⌘K intercept, page reporting) are
// attached to EVERY tab; the device-permission + download denials live on the shared
// default session.
//
// Control channel: newline-delimited JSON on stdin (navigate / tab-new / tab-select /
// tab-close / show / hide / bounds). The child reports its tab list on stdout as
// `AGENT_TABS {json}` (+ `AGENT_SHORTCUT`, `AGENT_PIPE_READY`/`AGENT_CDP`).

export function isAgentBrowserProcess(): boolean {
  return process.env.OPENMASQ_AGENT_BROWSER === "1";
}

function chromeUserAgent(): string {
  const major = (process.versions.chrome || "").split(".")[0] || "126";
  const platform =
    process.platform === "darwin"
      ? "Macintosh; Intel Mac OS X 10_15_7"
      : process.platform === "win32"
        ? "Windows NT 10.0; Win64; x64"
        : "X11; Linux x86_64";
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

// Anti-fingerprinting kill switch — the stealth patches are cosmetic + fail-open, but if
// one ever breaks a site, `OPENMASQ_AGENT_NO_STEALTH=1` reverts to a plain agent browser.
const STEALTH_ON = process.env.OPENMASQ_AGENT_NO_STEALTH !== "1";

// The Chrome major + platform, ONE source shared by the UA string, the Sec-CH-UA request
// header (below) and the JS `navigator.userAgentData` brands (preload/browserStealth.ts) —
// a mismatch between any of these is itself a bot tell, so they must agree.
const CHROME_MAJOR = (process.versions.chrome || "").split(".")[0] || "126";
const CH_PLATFORM =
  process.platform === "darwin" ? '"macOS"' : process.platform === "win32" ? '"Windows"' : '"Linux"';
// Same brand list (order + GREASE) as the preload's userAgentData, so header ⇄ JS agree.
const SEC_CH_UA = `"Chromium";v="${CHROME_MAJOR}", "Google Chrome";v="${CHROME_MAJOR}", "Not.A/Brand";v="24"`;

/** A coherent `Accept-Language` from the host locale (matches the JS `navigator.languages`
 *  the preload sets). Computed lazily — `app.getLocale()` is only valid after `ready`. */
function acceptLanguage(): string {
  const l = app.getLocale() || "en-US";
  return l.includes("-") ? `${l},${l.split("-")[0]};q=0.9,en;q=0.8` : `${l};q=0.9,en;q=0.8`;
}

// Final sink guard: only ever load real web origins into an agent tab. Last line of
// defence before `loadURL` — never `file://`, `data:`, `chrome://`, `devtools://`.
function isSafeAgentUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (u === "about:blank") return true;
  return u.startsWith("http://") || u.startsWith("https://");
}

// SYNCHRONOUS pre-check for `will-navigate`/`will-redirect`: rejects a bad scheme, an
// internal hostname, and a LITERAL private IP (a public page 302-ing to 169.254.169.254
// / a LAN IP). A hostname that RESOLVES private is caught by the async re-check below.
function navUrlBlocked(url: string): boolean {
  if (!isSafeAgentUrl(url)) return true;
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return true;
  }
  if (!host) return false;
  const lower = host.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local")) return true;
  if (isIP(host) && isPrivateIp(host)) return true;
  return false;
}

// BROAD Google-host match — used ONLY to rewrite outbound request headers (UA →
// Firefox, drop Sec-CH-UA). A false positive is harmless: it just sends a wrong UA
// on a host the page already talks to; no security impact. `google.evil.com` does
// NOT match (label before the TLD must be "google", preceded by start-or-dot).
function isGoogleHost(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === "google.com" || /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2,3})?$/.test(host);
}

// NARROW match — the federated sign-in ORIGIN only (accounts.google.com / ccTLD).
// This is the ONLY thing that gets a contextIsolation:false view, so it is kept as
// tight as possible: an attacker can't host content on accounts.google.com, so that
// weaker-isolation view only ever runs Google's OWN page — never attacker content.
function isGoogleAuthUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === "accounts.google.com" || /^accounts\.google\.[a-z]{2,3}(\.[a-z]{2,3})?$/.test(host);
}

function readCdpPort(userDataDir: string, timeoutMs = 8000): Promise<number> {
  const portFile = join(userDataDir, "DevToolsActivePort");
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      try {
        const port = parseInt(readFileSync(portFile, "utf8").split("\n")[0]?.trim() ?? "", 10);
        if (port > 0) return resolve(port);
      } catch {
        // not written yet
      }
      if (Date.now() > deadline) return reject(new Error("agent CDP port not written"));
      setTimeout(tick, 120);
    };
    tick();
  });
}

/** Entry for the isolated agent-browser process. Called at the very top of the main
 *  entry when OPENMASQ_AGENT_BROWSER=1 — before the normal app sets userData / locks. */
export function runAgentBrowserMain(): void {
  const base = process.env.OPENMASQ_AGENT_USERDATA || join(app.getPath("userData"), "agent-browser");
  app.setPath("userData", base);
  const pipeMode = process.env.OPENMASQ_AGENT_CDP_PIPE === "1";
  if (pipeMode) {
    app.commandLine.appendSwitch("remote-debugging-pipe");
  } else {
    app.commandLine.appendSwitch("remote-debugging-port", "0");
    app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
  }
  app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled");
  app.userAgentFallback = chromeUserAgent();
  if (process.platform === "darwin") app.dock?.hide();

  let win: BaseWindow | null = null;
  interface Tab {
    id: string;
    view: WebContentsView;
    lastActive: number; // monotonic; highest = most-recently active (LRU eviction key)
    faviconUrl?: string; // last page-declared icon URL we're (are) fetching — dedup key
    faviconData?: string; // the fetched icon as a raster, size-capped `data:` URL, else absent
    userNav?: boolean; // a USER navigation is in flight → attribute the next did-navigate to the human, not the model
    consentTried?: boolean; // best-effort cookie-consent dismiss already attempted for THIS page load
  }
  const tabs: Tab[] = [];
  let activeId: string | null = null;
  let attachedId: string | null = null; // the view currently in the window's contentView
  let seq = 1;
  let activeSeq = 0; // bumped each time a tab becomes active → the LRU ordering key

  // AUTOMATION gets a DEDICATED tab. The model drives over CDP; `agentTabId` is the tab it
  // works in, kept SEPARATE from the tab the user is looking at so both proceed in parallel —
  // the user navigating never clobbers the model's tab (it spins them a new one instead), and
  // switching the visible tab never moves the model. `driving` mirrors the renderer's
  // "automating" (forwarded over stdin); `agentTabId` is pinned when driving starts and
  // re-pointed whenever a CDP (non-user) navigation lands on a different tab.
  let driving = false;
  let agentTabId: string | null = null;

  const tabView = (id: string): WebContentsView | undefined => tabs.find((t) => t.id === id)?.view;
  const touchActive = (id: string): void => {
    const t = tabs.find((x) => x.id === id);
    if (t) t.lastActive = ++activeSeq;
  };
  // Memory backstop: cap the number of LIVE agent-browser WebContentsViews — each is a full
  // Chromium renderer (100-300 MB), and the inactive ones stay ALIVE for instant switch/CDP.
  // On exceeding the (generous) cap, CLOSE the LEAST-recently-active tab (never the active
  // one). It only fires on extreme tab sprawl; the model/user re-read the tab list, so a
  // closed rarely-used tab is recoverable (re-navigated on demand).
  const MAX_LIVE_TABS = 12;
  const evictLruTabs = (): void => {
    while (tabs.length > MAX_LIVE_TABS) {
      const victim = tabs
        .filter((t) => t.id !== activeId)
        .sort((a, b) => a.lastActive - b.lastActive)[0];
      if (!victim) break;
      closeTab(victim.id);
    }
  };

  // Report the full tab list (id / url / title / active) so the panel mirrors the REAL
  // tabs — opened by the user, by a page's `window.open`, or by the model over CDP.
  // DEBOUNCED: a chatty SPA fires many did-navigate-in-page/title-updated events; coalesce
  // them into one stdout line + one renderer re-render per burst.
  let reportTimer: NodeJS.Timeout | null = null;
  const reportTabs = (): void => {
    if (reportTimer) return;
    reportTimer = setTimeout(() => {
      reportTimer = null;
      const list = tabs.map((t) => {
        let url = "";
        let title = "";
        let loading = false;
        let canGoBack = false;
        let canGoForward = false;
        try {
          const wc = t.view.webContents;
          const u = wc.getURL();
          url = u === "about:blank" ? "" : u;
          title = wc.getTitle();
          loading = wc.isLoading();
          canGoBack = wc.navigationHistory.canGoBack();
          canGoForward = wc.navigationHistory.canGoForward();
        } catch {
          /* view torn down */
        }
        return { id: t.id, url, title, active: t.id === activeId, agent: driving && t.id === agentTabId, loading, canGoBack, canGoForward, favicon: t.faviconData };
      });
      process.stdout.write(`AGENT_TABS ${JSON.stringify(list)}\n`);
    }, 80);
  };

  // Only the ACTIVE view is ATTACHED to the window (sized to fill); the others are
  // DETACHED but their webContents stay ALIVE (state/DOM preserved → instant re-attach,
  // no reload; still a CDP target the model can drive). This is what makes the switch
  // instant and correct (no 0×0 phantom views fighting the z-order / repainting).
  const layout = (): void => {
    if (!win) return;
    const activeView = activeId ? tabView(activeId) : undefined;
    if (attachedId !== activeId) {
      const prev = attachedId ? tabView(attachedId) : undefined;
      if (prev) {
        try {
          win.contentView.removeChildView(prev);
        } catch {
          /* already detached */
        }
      }
      if (activeView) win.contentView.addChildView(activeView);
      attachedId = activeId;
    }
    if (activeView) {
      const b = win.getContentBounds();
      activeView.setBounds({ x: 0, y: 0, width: b.width, height: b.height });
    }
  };

  const selectTab = (id: string): void => {
    if (!tabView(id)) return;
    activeId = id;
    touchActive(id);
    layout();
    reportTabs();
  };

  const closeTab = (id: string): void => {
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx < 0 || !win) return;
    const [tab] = tabs.splice(idx, 1);
    try {
      win.contentView.removeChildView(tab.view);
      tab.view.webContents.close();
    } catch {
      /* already gone */
    }
    if (activeId === id) activeId = tabs[Math.max(0, idx - 1)]?.id ?? null;
    // The model's dedicated tab went away — unpin it (re-pinned on the next drive/CDP nav).
    if (agentTabId === id) agentTabId = null;
    // Never leave zero tabs — the CDP target set would be empty (@playwright/mcp needs one).
    if (tabs.length === 0) {
      createTab("about:blank");
      return;
    }
    layout();
    reportTabs();
  };

  const guardNavigation = (view: WebContentsView) => (e: { preventDefault: () => void }, url: string): void => {
    if (navUrlBlocked(url)) {
      e.preventDefault();
      return;
    }
    // Async re-resolution + public-IP check on EVERY navigation/redirect (a public page
    // 302-ing to a host that RESOLVES private). FAIL-CLOSED (audit M1): stop the load on
    // ANY verification failure — private/internal address OR an unexpected resolution
    // error — not only on a "Refused …" message (the old test let an unexpected throw sail
    // through). NOTE: this cannot fully close the DNS-REBINDING TOCTOU — Chromium
    // re-resolves the host itself at connect, and Electron's public API exposes no
    // per-navigation resolver pin, so a record that is public at THIS check but private at
    // Chromium's connect is stopped only after the fact. The robust fix (route the agent
    // session through a first-party loopback CONNECT proxy that resolves + pins the IP,
    // like `safeFetch`) is tracked as follow-up (needs browser e2e); this is the maximal
    // in-process mitigation. The tool-path model navigations are additionally gated by
    // `assertPublicUrl` in `mcp/index.ts` before the URL is ever issued.
    void assertPublicUrl(url, "browser").catch(() => {
      if (!view.webContents.isDestroyed()) {
        view.webContents.stop();
        void view.webContents.loadURL("about:blank");
      }
    });
  };

  // Best-effort COOKIE/CONSENT-banner dismissal (the reported Boursorama loop: a weak model
  // hovering « Tout accepter » without ever clicking, for many turns). The page-world snippet
  // + its safety rationale live in `consentDismiss.ts` (unit-tested). Runs via
  // `executeJavaScript` in the ISOLATED agent process and FAILS OPEN. One attempt + one retry.
  const dismissConsent = (wc: WebContents, attempt = 0): void => {
    if (wc.isDestroyed()) return;
    wc.executeJavaScript(CONSENT_DISMISS_JS, true)
      .then((clicked: unknown) => {
        // Consent widgets often inject a beat AFTER load settles — one delayed retry if nothing hit.
        if (!clicked && attempt < 1 && !wc.isDestroyed()) setTimeout(() => dismissConsent(wc, attempt + 1), 1000);
      })
      .catch(() => {}); // fail OPEN — never break the page
  };

  const attachGuards = (wc: WebContents, view: WebContentsView): void => {
    // A page opening a new window/tab (`window.open`, target=_blank) → a REAL new tab,
    // not a denied popup nor a stray OS window.
    wc.setWindowOpenHandler((details) => {
      // A tab the MODEL or a page opens is ALWAYS added in the BACKGROUND — it must never
      // steal the tab the user is currently looking at (they can pilot one tab while the
      // model works in another). It appears in the rail; the user switches to it if they
      // want. Only an explicit panel `tab-new`/`navigate` (a user action) activates a tab.
      if (isSafeAgentUrl(details.url)) createTab(details.url, false);
      return { action: "deny" };
    });
    const guard = guardNavigation(view);
    wc.on("will-navigate", guard);
    wc.on("will-redirect", guard);
    // A new document may have a DIFFERENT (or no) icon — drop the stale one so a page
    // without a favicon doesn't keep showing the previous site's. It repopulates when
    // `page-favicon-updated` fires for the new page.
    wc.on("did-navigate", () => {
      const tab = tabs.find((t) => t.view === view);
      if (tab) {
        tab.faviconUrl = undefined;
        tab.faviconData = undefined;
        tab.consentTried = false; // a new page → allow one fresh consent-dismiss attempt
        // Attribute this navigation. A USER-issued one consumes its flag; otherwise it came
        // from the MODEL over CDP — while it's driving, that marks THIS tab as the model's,
        // so a later user navigation on it opens a new user tab instead of clobbering it.
        if (tab.userNav) tab.userNav = false;
        else if (driving) agentTabId = tab.id;
      }
      reportTabs();
    });
    // The page DECLARED its favicon(s) — UNTRUSTED URLs (arbitrary web content). Fetch
    // the first http(s) one OUT OF BAND through the hardened path (`fetchFaviconDataUrl`:
    // SSRF-guarded, size-capped, RASTER-only → a `data:` URL), cache it on the tab and
    // re-report. A data:/svg/other URL is skipped → the rail keeps its letter fallback.
    wc.on("page-favicon-updated", (_e, favicons: string[]) => {
      const tab = tabs.find((t) => t.view === view);
      if (!tab) return;
      const iconUrl = favicons.find((u) => /^https?:\/\//i.test(u));
      if (!iconUrl || iconUrl === tab.faviconUrl) return; // none, or already have/fetching this one
      tab.faviconUrl = iconUrl;
      void fetchFaviconDataUrl(iconUrl).then((data) => {
        // The tab may have navigated/closed or its icon changed mid-fetch — only apply
        // if this is still the current icon request for a live tab.
        const t = tabs.find((x) => x.id === tab.id);
        if (!t || t.faviconUrl !== iconUrl) return;
        t.faviconData = data ?? undefined;
        reportTabs();
      });
    });
    wc.on("did-navigate-in-page", reportTabs);
    wc.on("page-title-updated", reportTabs);
    // Loading state rides the tab report (the panel's progress bar + spinner).
    wc.on("did-start-loading", reportTabs);
    wc.on("did-stop-loading", () => {
      reportTabs();
      // Best-effort: clear a cookie/consent wall ONCE per page load so a weak model isn't
      // stuck hovering it. Fails open; scoped to known consent widgets (see dismissConsent).
      // ONLY on a real http(s) page — never about:blank / non-web (no consent there, and it
      // must not run on the startup tab while @playwright/mcp is still enumerating targets).
      const tab = tabs.find((t) => t.view === view);
      if (tab && !tab.consentTried && /^https?:/i.test(wc.getURL())) {
        tab.consentTried = true;
        dismissConsent(wc);
      }
    });
    // ⌘K/Ctrl-K reaches the focused tab, not the app — intercept + forward (see index.ts).
    wc.on("before-input-event", (e, input) => {
      if (input.type !== "keyDown") return;
      if ((input.meta || input.control) && input.key?.toLowerCase() === "k") {
        e.preventDefault();
        process.stdout.write("AGENT_SHORTCUT cmd-k\n");
      }
    });
  };

  function createTab(url: string, activate = true): string {
    if (!win) return "";
    // Federated Google sign-in (a "Se connecter avec Google" popup / new tab) needs
    // contextIsolation OFF so LOGIN_PRELOAD can delete navigator.userAgentData in the
    // page's MAIN world — Google reads it in JS and a Chrome-brand value coming from an
    // embedded Chromium is the exact "not a real browser" tell. This is the ONE narrow
    // case; every normal tab keeps full isolation.
    // ATTACK SURFACE — deliberately bounded to ~zero delta vs. an isolated tab:
    //  • Only accounts.google.* ever reaches this branch (isGoogleAuthUrl checks the
    //    INITIAL url), and nobody but Google can serve content there → the weaker-
    //    isolation view only ever runs Google's OWN page, never attacker content.
    //  • sandbox stays ON, nodeIntegration OFF, and LOGIN_PRELOAD exposes NO
    //    ipcRenderer / Node / contextBridge — the page gains NO capability; it is still
    //    untrusted web content with no IPC, exactly like every other tab.
    //  • The same SSRF / popup / navigation guards attach below (attachGuards).
    const login = isGoogleAuthUrl(url);
    const view = new WebContentsView({
      webPreferences: login
        ? {
            ...DEVTOOLS_PREF,
            contextIsolation: false,
            nodeIntegration: false,
            sandbox: true,
            preload: LOGIN_PRELOAD,
          }
        : {
            ...DEVTOOLS_PREF,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            // The stealth preload runs SANDBOXED + ISOLATED and reaches the page only via
            // `webFrame.executeJavaScript` — no ipcRenderer/Node/contextBridge, no relaxed
            // boundary (browser CLAUDE.md "cosmetic only"). Omitted under the kill switch.
            ...(STEALTH_ON ? { preload: STEALTH_PRELOAD } : {}),
          },
    });
    const id = `tab${seq++}`;
    attachGuards(view.webContents, view);
    // New tabs start "recently active" so a fresh background tab is never the LRU victim.
    tabs.push({ id, view, lastActive: ++activeSeq });
    // First tab is always shown; otherwise `activate` decides (a background tab the model
    // opened while the user is driving doesn't take over the view).
    if (activate || activeId === null) {
      activeId = id;
      touchActive(id);
      layout(); // attaches this (now-active) view to the window
    }
    if (isSafeAgentUrl(url)) void view.webContents.loadURL(url);
    reportTabs();
    evictLruTabs(); // enforce the live-tab cap (rarely fires)
    return id;
  }

  // A USER navigation from the panel (URL bar, bookmark, link-open). While the model is
  // driving, a user navigation that would land on the model's DEDICATED tab opens a NEW
  // foreground user tab instead — so the human browses in parallel and never clobbers the
  // page the model is working on. Otherwise it loads in the target tab as before.
  const navigate = (url: string, tabId?: string): void => {
    if (!isSafeAgentUrl(url)) return;
    const targetId = tabId ?? activeId ?? null;
    if (driving && targetId && targetId === agentTabId) {
      createTab(url, true); // the user's own foreground tab; the model keeps agentTabId
      return;
    }
    const tab = targetId ? tabs.find((t) => t.id === targetId) : undefined;
    if (tab) {
      tab.userNav = true; // attribute the coming did-navigate to the USER, not the model
      void tab.view.webContents.loadURL(url);
    } else {
      createTab(url);
    }
  };

  app.whenReady().then(async () => {
    win = new BaseWindow({
      width: 1024,
      height: 720,
      show: false,
      title: `${BRAND.name} — Navigateur agent`,
      frame: false,
      alwaysOnTop: true,
      roundedCorners: false,
      hasShadow: false,
      backgroundColor: "#f4f4f2",
    });
    win.on("resize", layout);
    // Report this window's OS focus so the parent knows the app is still frontmost when the
    // user clicks INTO the browser (the main window blurs, but the app didn't lose focus).
    // Without it, the parent would hide the alwaysOnTop overlay the moment it's interacted with.
    win.on("focus", () => process.stdout.write("AGENT_FOCUS 1\n"));
    win.on("blur", () => process.stdout.write("AGENT_FOCUS 0\n"));

    // Device permissions + downloads: deny on the SHARED default session (all tab views
    // use it — the default context @playwright/mcp attaches to), so it covers every tab.
    const ses = session.defaultSession;
    ses.setPermissionRequestHandler((_wc, _perm, done) => done(false));
    ses.setPermissionCheckHandler(() => false);
    ses.on("will-download", (e) => e.preventDefault());

    // ── Google sign-in de-fingerprinting (mirrors mcp/authWindow.ts) ─────────────
    // Google refuses OAuth from anything it detects as an embedded/automated Chromium
    // ("disallowed_useragent" → "ce navigateur n'est peut-être pas sécurisé"). For
    // GOOGLE HOSTS ONLY we present a Firefox identity (Firefox emits no Sec-CH-UA
    // client hints), so the federated "Se connecter avec Google" on a SaaS the user
    // drives here (Canva…) is accepted. Scoped to Google → all other browsing keeps
    // the real Chrome UA; header-only → no view's process isolation is touched. The
    // matching JS-side fix (removing navigator.userAgentData) rides on LOGIN_PRELOAD,
    // attached only to the narrow accounts.google.* login view (see createTab).
    const acceptLang = acceptLanguage();
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = details.requestHeaders;
      if (isGoogleHost(details.url)) {
        // Google: present a Firefox identity (no Sec-CH-UA at all) so federated sign-in
        // isn't refused as an embedded Chromium.
        for (const key of Object.keys(headers)) {
          if (key.toLowerCase().startsWith("sec-ch-ua")) delete headers[key];
        }
        headers["User-Agent"] = FIREFOX_UA;
        callback({ requestHeaders: headers });
        return;
      }
      if (STEALTH_ON) {
        // Everywhere else: overwrite the Client Hints with clean Chrome-branded values
        // (Electron otherwise leaks an "Electron" brand → the CH disagree with the UA, a
        // classic bot tell), and pin a coherent Accept-Language to the host locale.
        for (const key of Object.keys(headers)) {
          if (key.toLowerCase().startsWith("sec-ch-ua")) delete headers[key];
        }
        headers["sec-ch-ua"] = SEC_CH_UA;
        headers["sec-ch-ua-mobile"] = "?0";
        headers["sec-ch-ua-platform"] = CH_PLATFORM;
        if (!headers["Accept-Language"]) headers["Accept-Language"] = acceptLang;
      }
      callback({ requestHeaders: headers });
    });

    // One initial tab so @playwright/mcp has a target to attach to on connect.
    createTab("about:blank");

    if (pipeMode) {
      process.stdout.write(`AGENT_PIPE_READY\n`);
    } else {
      try {
        const port = await readCdpPort(base);
        process.stdout.write(`AGENT_CDP http://127.0.0.1:${port}\n`);
      } catch (err) {
        process.stdout.write(`AGENT_CDP_ERROR ${err instanceof Error ? err.message : String(err)}\n`);
      }
    }

    let buf = "";
    process.stdin.on("data", (chunk) => {
      buf += chunk.toString();
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) handleCommand(line);
      }
    });
    process.stdin.resume();
  });

  function handleCommand(line: string): void {
    let msg: { cmd?: string; url?: string; tabId?: string; bounds?: Rectangle; on?: boolean };
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    // A command can race the shutdown teardown: the parent quits us via stdin end,
    // but a buffered bounds/show/hide/navigate line may still arrive after the window
    // is destroyed. `win` is then a non-null but destroyed reference, so any win.*
    // call throws "Object has been destroyed" (uncaught) — bail if it's gone.
    if (!win || win.isDestroyed()) return;
    switch (msg.cmd) {
      // navigate / tab-* / back / forward arrive ONLY from the panel (the human) — the model
      // drives over CDP, never this pipe. A user `navigate`/`tab-new` explicitly activates
      // its tab (unlike a model/page `window.open`, which stays in the background).
      case "navigate":
        if (msg.url) navigate(msg.url, msg.tabId);
        break;
      case "tab-new":
        createTab(msg.url && isSafeAgentUrl(msg.url) ? msg.url : "about:blank", true);
        break;
      case "tab-select":
        if (msg.tabId) selectTab(msg.tabId);
        break;
      case "tab-close":
        if (msg.tabId) closeTab(msg.tabId);
        break;
      // Session-history navigation on the ACTIVE tab — strictly weaker than `navigate`
      // (every history entry already passed the will-navigate/redirect SSRF guards when
      // it first loaded, and redirects on the way back are re-guarded like any load).
      case "back":
      case "forward": {
        const view = activeId ? tabView(activeId) : undefined;
        if (view && !view.webContents.isDestroyed()) {
          const h = view.webContents.navigationHistory;
          if (msg.cmd === "back" && h.canGoBack()) h.goBack();
          if (msg.cmd === "forward" && h.canGoForward()) h.goForward();
        }
        break;
      }
      // The renderer's "automating" state (forwarded from main). Pin the model's dedicated
      // tab to whatever is current when driving starts — its first CDP action lands there;
      // a later CDP nav to a different tab re-points it (see did-navigate).
      case "driving":
        driving = msg.on === true;
        if (driving && !agentTabId) agentTabId = activeId;
        break;
      case "show":
        win.show();
        break;
      case "hide":
        win.hide();
        break;
      case "bounds":
        if (msg.bounds) {
          win.setBounds(msg.bounds);
          layout();
        }
        break;
    }
  }

  process.stdin.on("end", () => {
    console.error("[agent-child] stdin closed by parent → quitting");
    app.quit();
  });
  app.on("window-all-closed", () => {
    /* Keep running headless if hidden; the parent quits us via stdin end. */
  });

  // Robustness + diagnostics for the "agent window flashes open/closed" symptom:
  // that is THIS child spawning then dying in a loop (the parent's browser-heal
  // respawns it each time it goes down). A background error must NOT hard-kill the
  // browser — mirror the main app's report-only policy so an uncaught throw can't
  // crash the child (which would look exactly like the flash). All lines go to
  // stderr (inherited by the parent terminal), never a URL/title/secret, so they
  // are safe to leave on: run the app from a terminal and read the `[agent-child]`
  // lines to see WHY the browser goes down.
  process.on("uncaughtException", (e) =>
    console.error("[agent-child] uncaughtException (kept alive):", e instanceof Error ? e.stack : e),
  );
  process.on("unhandledRejection", (e) =>
    console.error("[agent-child] unhandledRejection (kept alive):", e instanceof Error ? e.stack : e),
  );
  // A GPU/renderer crash of a tab view (a plausible flash cause on some hardware).
  app.on("render-process-gone", (_e, _wc, details) =>
    console.error("[agent-child] render-process-gone:", details.reason, details.exitCode),
  );
  app.on("child-process-gone", (_e, details) =>
    console.error("[agent-child] child-process-gone:", details.type, details.reason),
  );
}
