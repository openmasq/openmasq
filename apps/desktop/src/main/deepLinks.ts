import { app, ipcMain } from "electron";
import { BRAND } from "@openmasq/branding";
import { deepLinkTarget } from "./deepLink";
import { getMainWindow, withMainWindow } from "./mainWindowRef";
import { completeOpenRouterConnect } from "./store/openrouterPkce";

// Deep links: `<protocol>://auth|billing|openrouter/…` handed to the app by the OS. ONE
// gate decides what is routed (`deepLink.ts`, allow-list + tests); the rest of this file
// is buffering and delivery to the window. The scheme is the brand's (`branding.json`).
export const AUTH_SCHEME = BRAND.protocol;
// Buffers a callback URL that arrives before the renderer has subscribed
// (cold start: the link launches the app). Flushed once the renderer is ready.
// `<protocol>://auth/…` → auth:callback (PKCE exchange); `<protocol>://billing/…` →
// billing:callback (post-Stripe-checkout refocus + subscription refresh).
let pendingAuthUrl: string | null = null;
let pendingBillingUrl: string | null = null;
let rendererAuthReady = false;
function flushAuthUrl(): void {
  const win = getMainWindow();
  if (rendererAuthReady && pendingAuthUrl && win && !win.isDestroyed()) {
    win.webContents.send("auth:callback", pendingAuthUrl);
    pendingAuthUrl = null;
  }
}
function flushBillingUrl(): void {
  const win = getMainWindow();
  if (rendererAuthReady && pendingBillingUrl && win && !win.isDestroyed()) {
    win.webContents.send("billing:callback", pendingBillingUrl);
    pendingBillingUrl = null;
  }
}
export function deliverAuthUrl(url: string | undefined): void {
  // ONE gate for every deep-link URL the OS hands us (`deepLink.ts`, allow-list +
  // tests): unknown scheme/host/path is refused, never routed by default.
  const target = url ? deepLinkTarget(url, AUTH_SCHEME) : null;
  if (!url || !target) return;
  // `<protocol>://openrouter/callback` is completed HERE, in main, and never forwarded: the
  // provider key it mints is written straight to the encrypted store, so it does not
  // cross the IPC boundary at all (`store/openrouterPkce.ts`). The renderer only learns
  // that a key now exists, via the `keys:connect-openrouter` promise it is awaiting.
  if (target === "openrouter") {
    withMainWindow((w) => {
      if (w.isMinimized()) w.restore();
      w.focus();
    });
    void completeOpenRouterConnect(url);
    return;
  }
  // Bring the app to the front (the user is returning from the system browser).
  withMainWindow((w) => {
    if (w.isMinimized()) w.restore();
    w.focus();
  });
  if (target === "billing") {
    pendingBillingUrl = url;
    flushBillingUrl();
  } else {
    pendingAuthUrl = url;
    flushAuthUrl();
  }
}
/**
 * The three ways a deep link reaches a RUNNING app: macOS `open-url`, a second launch's
 * argv on Windows/Linux, and the renderer telling us it is ready to receive what was
 * buffered during boot. Installed once, at startup, before `whenReady`.
 */

export function installDeepLinkHandlers(): void {
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
}
