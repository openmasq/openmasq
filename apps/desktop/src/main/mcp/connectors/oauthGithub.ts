import { clipboard } from "electron";
import { openAuthWindow } from "../authWindow";
import { connectSignal } from "../server/connectCancel";
import { BRAND } from "@openmasq/branding";

/**
 * GitHub OAuth **device flow** — the desktop-direct login for the GitHub connector.
 * No secret, no redirect, no loopback: we request a device+user code, then open
 * github.com/login/device IN A DEDICATED IN-APP WINDOW (not the system browser +
 * a bare native dialog), with the code copied to the clipboard, shown in a banner
 * we inject, and best-effort pre-filled into the field — then poll for the token
 * and CLOSE the window automatically on success. Requires the OAuth App to have
 * "device flow" enabled.
 */

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const GRANT = "urn:ietf:params:oauth:grant-type:device_code";

interface DeviceCode {
  device_code: string;
  user_code: string;
  verification_uri: string;
  /** RFC 8628 pre-filled URL (rare on github.com; used when present). */
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
  interval?: number;
}

async function postJson<T>(url: string, body: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) {
    await res.text().catch(() => "");
    throw new Error(`GitHub OAuth request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** In-page helper injected into the device window: a banner showing the code (also
 *  on the clipboard) + a best-effort pre-fill of the code field. Pure DOM we own —
 *  a selector change can only skip the auto-fill, never break the login.
 *
 *  ⚠️ The code is placed with `textContent`, never `innerHTML`. `JSON.stringify` below
 *  makes it a safe JS *literal*, which says nothing about HTML: concatenating it into
 *  `innerHTML` would let a `user_code` carrying markup execute in github.com's own
 *  origin — the page holding the session we are in the middle of authorising. GitHub's
 *  API is the source, so this was never a live bug; building the node costs nothing and
 *  removes the question. The rendering is byte-for-byte the same. */
function bannerScript(code: string): string {
  const c = JSON.stringify(code);
  return `(function(){try{
    var CODE=${c};
    var inp=document.querySelector('input#user_code,input[name="user_code"],input[name="user-code"],input[autocomplete="one-time-code"]');
    if(inp&&!inp.value){inp.value=CODE;inp.dispatchEvent(new Event('input',{bubbles:true}));inp.dispatchEvent(new Event('change',{bubbles:true}));}
    if(document.getElementById('openmasq-code-banner'))return;
    var b=document.createElement('div');b.id='openmasq-code-banner';
    b.style.cssText='position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#0d1117;color:#fff;font:600 13px system-ui,-apple-system,sans-serif;padding:11px 16px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.35)';
    var s=document.createElement('span');
    s.style.cssText='font:700 17px ui-monospace,SFMono-Regular,monospace;letter-spacing:2px;margin:0 6px;vertical-align:middle';
    s.textContent=CODE;
    b.appendChild(document.createTextNode('Code ${BRAND.name} (copié) : '));
    b.appendChild(s);
    b.appendChild(document.createTextNode(' — collez-le (⌘V / Ctrl+V) puis autorisez l’accès.'));
    document.body.appendChild(b);document.body.style.paddingTop='50px';
  }catch(e){}})();`;
}

/**
 * Run the device flow for `clientId`/`scopes` and resolve the access token.
 * Throws if the user cancels (closes the window), denies, or the code expires.
 */
export async function githubDeviceLogin(opts: {
  clientId: string;
  scopes: string[];
  serverName: string;
}): Promise<string> {
  const dc = await postJson<DeviceCode>(DEVICE_CODE_URL, {
    client_id: opts.clientId,
    scope: opts.scopes.join(" "),
  });

  // Copy the code so a single paste completes the field, then open the device page
  // in-app (dedicated window) rather than the system browser.
  clipboard.writeText(dc.user_code);
  const win = openAuthWindow(dc.verification_uri_complete || dc.verification_uri);
  win.setTitle(`Connecter ${opts.serverName} — code ${dc.user_code}`);
  const inject = () => {
    win.webContents.executeJavaScript(bannerScript(dc.user_code)).catch(() => {});
  };
  win.webContents.on("did-finish-load", inject);
  inject();

  let cancelled = false;
  win.on("closed", () => {
    cancelled = true;
  });
  // "Annuler" during the device flow: close the window — its `closed` handler above
  // flips `cancelled`, so the poll loop stops before the next token request.
  const signal = connectSignal();
  const onAbort = () => {
    if (!win.isDestroyed()) win.close();
  };
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    const deadline = Date.now() + dc.expires_in * 1000;
    let interval = Math.max(5, dc.interval || 5);
    while (Date.now() < deadline) {
      if (cancelled) throw new Error("Connexion annulée");
      await sleep(interval * 1000);
      if (cancelled) throw new Error("Connexion annulée");
      const tok = await postJson<TokenResponse>(TOKEN_URL, {
        client_id: opts.clientId,
        device_code: dc.device_code,
        grant_type: GRANT,
      });
      if (tok.access_token) return tok.access_token;
      if (tok.error === "authorization_pending") continue;
      if (tok.error === "slow_down") {
        interval = tok.interval ?? interval + 5;
        continue;
      }
      if (tok.error === "access_denied") throw new Error("Accès refusé sur GitHub");
      // expired_token / unsupported_grant_type / anything else → stop.
      throw new Error("La connexion GitHub a expiré — réessayez");
    }
    throw new Error("La connexion GitHub a expiré — réessayez");
  } finally {
    if (!win.isDestroyed()) win.close();
  }
}
