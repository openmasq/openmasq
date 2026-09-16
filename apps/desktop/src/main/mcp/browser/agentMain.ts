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
import { join } from "node:path";
import { assertPublicUrl } from "../../net/net";
import { fetchFaviconDataUrl } from "../../net/favicon";
import { FIREFOX_UA, LOGIN_PRELOAD, STEALTH_PRELOAD } from "../../browserSession";
import { isBlankUrl, isSafeAgentUrl, loadGuarded, navUrlBlocked } from "./loadGuard";
import { CONSENT_DISMISS_JS } from "./consentDismiss"; import { BRAND } from "@openmasq/branding";

// ── Isolated agent-browser process (MULTI-TAB) ───────────────────────────────
// SECURITY: CDP is process-global, and in the MAIN process it would expose the React UI
// page (`window.openmasq` = full IPC). So the agent browser is THIS separate Electron
// process (the same binary re-spawned with OPENMASQ_AGENT_BROWSER=1) hosting ONLY agent
// pages: every CDP target is untrusted web content with NO IPC. Main never opens CDP.
//
// A `BaseWindow` (no webContents of its own → no stray CDP target) holds one
// `WebContentsView` per tab; only the active one is attached, the others stay alive. The
// per-webContents guards (navigation SSRF, popups→new tab, ⌘K intercept, reporting) attach
// to EVERY tab; permission + download denials live on the shared default session.
//
// Control channel: newline-delimited JSON on stdin; the child reports on stdout
// (`AGENT_TABS {json}`, `AGENT_SHORTCUT`, `AGENT_PIPE_READY`/`AGENT_CDP`).

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

// Anti-fingerprinting kill switch: the stealth patches are cosmetic + fail-open;
// `OPENMASQ_AGENT_NO_STEALTH=1` reverts to a plain agent browser.
const STEALTH_ON = process.env.OPENMASQ_AGENT_NO_STEALTH !== "1";

// ONE source for the UA string, the Sec-CH-UA header and the JS `navigator.userAgentData`
// brands (preload/browserStealth.ts): a mismatch between them is itself a bot tell.
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

// BROAD Google-host match, used ONLY to rewrite outbound request headers. A false
// positive is harmless (a wrong UA on a host the page already talks to).
// `google.evil.com` does NOT match.
function isGoogleHost(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === "google.com" || /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2,3})?$/.test(host);
}

// NARROW match: the federated sign-in ORIGIN only. This is the ONLY thing that gets a
// contextIsolation:false view, so the weaker-isolation view only ever runs Google's OWN
// page, never attacker content.
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

  // The model works in a DEDICATED tab (`agentTabId`), separate from the one the user looks
  // at, so both proceed in parallel. `driving` mirrors the renderer's "automating";
  // `agentTabId` is pinned when driving starts and re-pointed on a CDP navigation.
  let driving = false;
  let agentTabId: string | null = null;

  const tabView = (id: string): WebContentsView | undefined => tabs.find((t) => t.id === id)?.view;
  const touchActive = (id: string): void => {
    const t = tabs.find((x) => x.id === id);
    if (t) t.lastActive = ++activeSeq;
  };
  // Memory backstop: each live view is a full Chromium renderer. Past the cap, close the
  // LEAST-recently-active tab (never the active one).
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

  // Report the tab list so the panel mirrors the REAL tabs (user, `window.open`, CDP).
  // DEBOUNCED: a chatty SPA fires many events per burst.
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

  // Only the ACTIVE view is attached to the window; the others are detached but alive
  // (DOM preserved, still a CDP target). No 0×0 phantom views fighting the z-order.
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
    // Async re-resolution + public-IP check on EVERY navigation/redirect. FAIL-CLOSED: the
    // load stops on ANY verification failure, a private address OR an unexpected error.
    // RESIDUAL: Chromium re-resolves the host itself at connect and exposes no per-
    // navigation resolver pin, so a DNS-rebinding record is stopped only after the fact;
    // the full fix is a first-party loopback CONNECT proxy that pins the IP.
    void assertPublicUrl(url, "browser").catch(() => {
      if (!view.webContents.isDestroyed()) {
        view.webContents.stop();
        void view.webContents.loadURL("about:blank");
      }
    });
  };

  // Best-effort cookie/consent-banner dismissal so a weak model doesn't hover the banner
  // for turns. The snippet + its safety rationale live in `consentDismiss.ts`. FAILS OPEN.
  const dismissConsent = (wc: WebContents, attempt = 0): void => {
    if (wc.isDestroyed()) return;
    wc.executeJavaScript(CONSENT_DISMISS_JS, true)
      .then((clicked: unknown) => {
        // Consent widgets often inject AFTER load settles: one delayed retry.
        if (!clicked && attempt < 1 && !wc.isDestroyed()) setTimeout(() => dismissConsent(wc, attempt + 1), 1000);
      })
      .catch(() => {}); // fail OPEN — never break the page
  };

  const attachGuards = (wc: WebContents, view: WebContentsView): void => {
    // A page opening a new window/tab (`window.open`, target=_blank) → a REAL new tab,
    // not a denied popup nor a stray OS window.
    wc.setWindowOpenHandler((details) => {
      // A tab the MODEL or a page opens is added in the BACKGROUND: it must never steal
      // the tab the user is looking at. Only a panel `tab-new`/`navigate` activates a tab.
      if (isSafeAgentUrl(details.url)) createTab(details.url, false);
      return { action: "deny" };
    });
    const guard = guardNavigation(view);
    wc.on("will-navigate", guard);
    wc.on("will-redirect", guard);
    // A new document may have a different (or no) icon: drop the stale one.
    wc.on("did-navigate", () => {
      const tab = tabs.find((t) => t.view === view);
      if (tab) {
        tab.faviconUrl = undefined;
        tab.faviconData = undefined;
        tab.consentTried = false; // a new page → allow one fresh consent-dismiss attempt
        // A USER-issued navigation consumes its flag; otherwise it came from the MODEL over
        // CDP and, while driving, marks THIS tab as the model's.
        if (tab.userNav) tab.userNav = false;
        else if (driving) agentTabId = tab.id;
      }
      reportTabs();
    });
    // Page-declared favicon URLs are UNTRUSTED: fetch the first http(s) one through the
    // hardened path (`fetchFaviconDataUrl`: SSRF-guarded, size-capped, raster-only).
    wc.on("page-favicon-updated", (_e, favicons: string[]) => {
      const tab = tabs.find((t) => t.view === view);
      if (!tab) return;
      const iconUrl = favicons.find((u) => /^https?:\/\//i.test(u));
      if (!iconUrl || iconUrl === tab.faviconUrl) return; // none, or already have/fetching this one
      tab.faviconUrl = iconUrl;
      void fetchFaviconDataUrl(iconUrl).then((data) => {
        // Only apply if this is still the current icon request for a live tab.
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
      // Consent dismissal ONCE per page load, ONLY on a real http(s) page: it must not run
      // on the startup tab while @playwright/mcp is still enumerating targets.
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
    // Federated Google sign-in needs contextIsolation OFF so LOGIN_PRELOAD can delete
    // navigator.userAgentData in the page's MAIN world (Google reads it in JS). The ONE
    // narrow case, bounded to ~zero delta vs. an isolated tab: only accounts.google.*
    // reaches this branch and nobody else serves content there; sandbox stays ON,
    // nodeIntegration OFF, the preload exposes NO ipcRenderer/Node/contextBridge; the
    // same guards attach below.
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
            // Sandboxed + isolated; reaches the page only via `webFrame.executeJavaScript`.
            ...(STEALTH_ON ? { preload: STEALTH_PRELOAD } : {}),
          },
    });
    const id = `tab${seq++}`;
    attachGuards(view.webContents, view);
    // New tabs start "recently active" so a fresh background tab is never the LRU victim.
    tabs.push({ id, view, lastActive: ++activeSeq });
    // First tab is always shown; otherwise `activate` decides.
    if (activate || activeId === null) {
      activeId = id;
      touchActive(id);
      layout(); // attaches this (now-active) view to the window
    }
    // WHAT it loads goes through the sink guard (`will-navigate` never fires for this
    // call — see `loadGuarded`), so an internal address opens an empty tab.
    void loadGuarded(view.webContents, url);
    reportTabs();
    evictLruTabs(); // enforce the live-tab cap (rarely fires)
    return id;
  }

  // A USER navigation from the panel. While the model is driving, one that would land on
  // the model's tab opens a NEW foreground user tab instead.
  const navigate = (url: string, tabId?: string): void => {
    // Sync floor first, so a refused URL never picks a target tab; the DNS re-check runs
    // inside `loadGuarded`.
    if (!isBlankUrl(url) && navUrlBlocked(url)) return;
    const targetId = tabId ?? activeId ?? null;
    if (driving && targetId && targetId === agentTabId) {
      createTab(url, true); // the user's own foreground tab; the model keeps agentTabId
      return;
    }
    const tab = targetId ? tabs.find((t) => t.id === targetId) : undefined;
    if (tab) {
      // Set only once the load is ALLOWED, or a refused navigation misattributes the next
      // `did-navigate` to the user.
      void loadGuarded(tab.view.webContents, url, () => {
        tab.userNav = true; // attribute the coming did-navigate to the USER, not the model
      });
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
    // OS focus of this window, so the parent knows the app is still frontmost when the
    // user clicks INTO the browser (and doesn't hide the alwaysOnTop overlay).
    win.on("focus", () => process.stdout.write("AGENT_FOCUS 1\n"));
    win.on("blur", () => process.stdout.write("AGENT_FOCUS 0\n"));

    // Device permissions + downloads: denied on the SHARED default session (every tab).
    const ses = session.defaultSession;
    ses.setPermissionRequestHandler((_wc, _perm, done) => done(false));
    ses.setPermissionCheckHandler(() => false);
    ses.on("will-download", (e) => e.preventDefault());

    // Google refuses OAuth from an embedded/automated Chromium ("disallowed_useragent").
    // For GOOGLE HOSTS ONLY we present a Firefox identity (no Sec-CH-UA); header-only, so
    // no view's isolation is touched. The JS side rides on LOGIN_PRELOAD (createTab).
    const acceptLang = acceptLanguage();
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = details.requestHeaders;
      if (isGoogleHost(details.url)) {
        for (const key of Object.keys(headers)) {
          if (key.toLowerCase().startsWith("sec-ch-ua")) delete headers[key];
        }
        headers["User-Agent"] = FIREFOX_UA;
        callback({ requestHeaders: headers });
        return;
      }
      if (STEALTH_ON) {
        // Everywhere else: Chrome-branded Client Hints (Electron otherwise leaks an
        // "Electron" brand that disagrees with the UA) and a coherent Accept-Language.
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
    // A buffered command can arrive after the window is destroyed; any win.* call would
    // then throw.
    if (!win || win.isDestroyed()) return;
    switch (msg.cmd) {
      // navigate / tab-* / back / forward arrive ONLY from the panel (the human); the model
      // drives over CDP, never this pipe.
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
      // Session-history navigation: every entry already passed the SSRF guards when it
      // first loaded, and redirects on the way back are re-guarded like any load.
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
      // The renderer's "automating" state. Pin the model's tab to the current one when
      // driving starts; a later CDP nav re-points it (see did-navigate).
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

  // A background error must NOT kill the child (the parent would respawn it in a loop).
  // Report-only, on stderr, never a URL/title/secret.
  process.on("uncaughtException", (e) =>
    console.error("[agent-child] uncaughtException (kept alive):", e instanceof Error ? e.stack : e),
  );
  process.on("unhandledRejection", (e) =>
    console.error("[agent-child] unhandledRejection (kept alive):", e instanceof Error ? e.stack : e),
  );
  app.on("render-process-gone", (_e, _wc, details) =>
    console.error("[agent-child] render-process-gone:", details.reason, details.exitCode),
  );
  app.on("child-process-gone", (_e, details) =>
    console.error("[agent-child] child-process-gone:", details.type, details.reason),
  );
}
