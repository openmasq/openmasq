import { BrowserWindow, session } from "electron";
import { DEVTOOLS_PREF } from "../devtools";
import { FIREFOX_UA, LOGIN_PRELOAD, partitionFor } from "../browserSession";

/** Dedicated partition for connector OAuth (keeps the provider sign-in cached). */
const OAUTH_PARTITION_ID = "mcp-oauth";

// Electron 31 ships Chromium 126; providers like Notion reject that as "browser
// not compatible". So the OAuth window gets its own modern, self-consistent Chrome
// identity — UA + Sec-CH-UA hints + (via the login preload, which reads
// navigator.userAgent) navigator.userAgentData.
const OAUTH_CHROME_VERSION = "140.0.0.0";
const OAUTH_CHROME_MAJOR = "140";
const OAUTH_UA =
  `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ` +
  `(KHTML, like Gecko) Chrome/${OAUTH_CHROME_VERSION} Safari/537.36`;
const SEC_CH_UA = `"Chromium";v="${OAUTH_CHROME_MAJOR}", "Google Chrome";v="${OAUTH_CHROME_MAJOR}", "Not.A/Brand";v="24"`;
const SEC_CH_UA_FULL = `"Chromium";v="${OAUTH_CHROME_VERSION}", "Google Chrome";v="${OAUTH_CHROME_VERSION}", "Not.A/Brand";v="24.0.0.0"`;

let configured = false;

/** UA + matching client-hint headers on the OAuth partition (Google → Firefox). */
function configureOAuthSession(): void {
  const s = session.fromPartition(partitionFor(OAUTH_PARTITION_ID));
  s.setUserAgent(OAUTH_UA);
  if (configured) return;
  configured = true;
  s.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders;
    const isGoogle =
      /(^|\.)google\.[a-z.]+\//i.test(details.url) || details.url.includes("accounts.google");
    if (isGoogle) {
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase().startsWith("sec-ch-ua")) delete headers[key];
      }
      headers["User-Agent"] = FIREFOX_UA;
    } else {
      for (const key of Object.keys(headers)) {
        switch (key.toLowerCase()) {
          case "sec-ch-ua":
            headers[key] = SEC_CH_UA;
            break;
          case "sec-ch-ua-full-version-list":
            headers[key] = SEC_CH_UA_FULL;
            break;
          case "sec-ch-ua-full-version":
            headers[key] = `"${OAUTH_CHROME_VERSION}"`;
            break;
          case "sec-ch-ua-mobile":
            headers[key] = "?0";
            break;
          case "sec-ch-ua-platform":
            headers[key] = '"macOS"';
            break;
        }
      }
    }
    callback({ requestHeaders: headers });
  });
}

/**
 * Open a provider's OAuth authorization page in a dedicated Electron window
 * instead of the system browser. Two reasons it can't be `shell.openExternal`:
 *  1. On macOS the provider URL (notion.so…) is often claimed by that vendor's
 *     desktop app as a universal link, so the login never redirects back to our
 *     loopback and the consent screen never appears.
 *  2. Providers sniff the UA; the default Electron UA is rejected as too old /
 *     "not a real browser" — hence the modern spoofed identity above.
 * The window then follows the 302 to `http://127.0.0.1:<port>/callback` normally.
 */
export function openAuthWindow(url: string): BrowserWindow {
  configureOAuthSession();

  const prefs = {
    partition: partitionFor(OAUTH_PARTITION_ID),
    // `contextIsolation: false` is required (the preload patches `navigator.userAgentData`
    // in the page's main world); the OS sandbox is NOT — `agentMain.ts` runs this very
    // preload with `sandbox: true` on the Google login view. This window renders a remote
    // page, so it keeps the sandbox too.
    sandbox: true,
    contextIsolation: false,
    nodeIntegration: false,
    preload: LOGIN_PRELOAD,
    ...DEVTOOLS_PREF,
  };

  const win = new BrowserWindow({
    width: 520,
    height: 760,
    title: "Connexion au service",
    autoHideMenuBar: true,
    webPreferences: prefs,
  });
  win.webContents.setUserAgent(OAUTH_UA);
  // SECURITY (external scan #3): DENY child windows. This window is used ONLY for the
  // GitHub device flow (`oauthGithub.ts` — a code-entry page on github.com, no federated
  // popups), so a popup could only be an injected/redirected page; opening one with the
  // same non-isolated, preloaded prefs was a needless escalation surface. (The window
  // itself keeps `contextIsolation:false` because LOGIN_PRELOAD must patch
  // `navigator.userAgentData` in the page's main world for anti-fingerprint — but that
  // preload exposes NO ipcRenderer / Node / contextBridge, so it hands the page no
  // capability; the remaining risk is bounded.)
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  void win.loadURL(url, { userAgent: OAUTH_UA });
  return win;
}
