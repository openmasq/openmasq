/**
 * Anti-fingerprinting preload for the agent browser's NORMAL tabs (contextIsolation
 * ON). Those tabs keep full isolation, so this sandboxed preload runs in the ISOLATED
 * world and reaches the page's MAIN world only through `webFrame.executeJavaScript` —
 * it exposes NO ipcRenderer / Node / contextBridge, adds NO capability to the page, and
 * relaxes NO security boundary (the browser CLAUDE.md's "cosmetic only" rule). It just
 * makes an automated-but-legitimate Chromium look like a plain Chrome so the user's own
 * signed-in sites don't false-flag it as a bot.
 *
 * Every patch is individually guarded and the whole injection fails OPEN — a throw here
 * must never break page load. The Google login view uses `login.ts` instead (main world,
 * isolation off); this is the equivalent for every other tab.
 */
import { webFrame } from "electron";

// Runs in the page's MAIN WORLD. Self-contained (no closure refs — it's stringified),
// reads its own `navigator`, and touches only cosmetic fingerprint surfaces.
function applyStealthPatches(): void {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const def = (o: any, p: string, get: () => unknown): void => {
    try {
      Object.defineProperty(o, p, { get, configurable: true });
    } catch {
      /* non-configurable — leave it */
    }
  };
  const nav: any = navigator;
  const win: any = window;

  // webdriver — belt & braces (the `AutomationControlled` blink flag should already
  // remove it, but a residual `true` here is the single loudest bot signal).
  def(nav, "webdriver", () => undefined);

  // navigator.languages coherent with the host locale (a lone "en-US" is a tell).
  try {
    const l: string = nav.language || "en-US";
    const langs = l.indexOf("-") > -1 ? [l, l.split("-")[0]] : [l];
    def(nav, "languages", () => langs);
  } catch {
    /* ignore */
  }

  // userAgentData brands aligned to the UA major — Electron leaks an "Electron" brand,
  // so the JS client hints disagree with the UA string (a classic mismatch tell).
  try {
    const ua: string = nav.userAgent || "";
    const major = (/Chrome\/(\d+)/.exec(ua) || ([undefined, "126"] as unknown as RegExpExecArray))[1];
    const platform = /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "macOS" : "Linux";
    const brands = [
      { brand: "Chromium", version: major },
      { brand: "Google Chrome", version: major },
      { brand: "Not.A/Brand", version: "24" },
    ];
    if (nav.userAgentData) {
      const uaData = {
        brands,
        mobile: false,
        platform,
        getHighEntropyValues: () => Promise.resolve({ brands, mobile: false, platform }),
        toJSON: () => ({ brands, mobile: false, platform }),
      };
      def(nav, "userAgentData", () => uaData);
    }
  } catch {
    /* ignore */
  }

  // window.chrome / chrome.runtime — real Chrome has these; Electron's is thin/absent.
  try {
    win.chrome = win.chrome || {};
    if (!win.chrome.runtime) win.chrome.runtime = {};
  } catch {
    /* ignore */
  }

  // permissions: Notification query must agree with Notification.permission — a
  // `denied` from query() while permission is `default` is a well-known headless tell.
  try {
    const perms = nav.permissions;
    if (perms && typeof perms.query === "function") {
      const orig = perms.query.bind(perms);
      perms.query = (p: any) =>
        p && p.name === "notifications"
          ? Promise.resolve({ state: Notification.permission, onchange: null })
          : orig(p);
    }
  } catch {
    /* ignore */
  }

  // navigator.plugins — a real Chrome exposes the built-in PDF viewer; an empty list
  // reads as automation. Only fill it when the engine reports none.
  try {
    if (!nav.plugins || nav.plugins.length === 0) {
      const plugins = [
        { name: "Chrome PDF Plugin", description: "Portable Document Format", filename: "internal-pdf-viewer" },
        { name: "Chrome PDF Viewer", description: "", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" },
      ];
      def(nav, "plugins", () => plugins);
    }
  } catch {
    /* ignore */
  }

  // WebGL vendor/renderer — mask a "Google SwiftShader" software renderer (a VM/headless
  // signal) with a common hardware GPU string. Only the two UNMASKED_* params.
  try {
    const patchGl = (proto: any): void => {
      if (!proto || !proto.getParameter) return;
      const gp = proto.getParameter;
      proto.getParameter = function (this: unknown, p: number) {
        if (p === 37445) return "Intel Inc."; // UNMASKED_VENDOR_WEBGL
        if (p === 37446) return "Intel Iris OpenGL Engine"; // UNMASKED_RENDERER_WEBGL
        return gp.call(this, p);
      };
    };
    patchGl(win.WebGLRenderingContext && win.WebGLRenderingContext.prototype);
    patchGl(win.WebGL2RenderingContext && win.WebGL2RenderingContext.prototype);
  } catch {
    /* ignore */
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

try {
  // Stringify + IIFE so it runs in the MAIN world at document-start, before page scripts.
  void webFrame.executeJavaScript(`(${applyStealthPatches.toString()})()`).catch(() => {});
} catch {
  /* fail open — the page loads normally, just without the cosmetic patches */
}
