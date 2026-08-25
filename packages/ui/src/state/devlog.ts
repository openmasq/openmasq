import type { Middleware } from "@reduxjs/toolkit";
import { captureEvent } from "../analytics";
import type { TrackEvent } from "../analytics";

/**
 * Dev mode = the renderer is served by the Vite dev server over http(s); a
 * packaged build loads from file://. Reliable here without relying on a
 * build-time define being applied to a prebuilt dependency.
 */
export const isDevMode = (() => {
  try {
    // Vite dev server serves over http(s); a packaged build loads from file://.
    if (typeof window !== "undefined" && window.location) {
      const { protocol, hostname } = window.location;
      if (protocol === "http:" || protocol === "https:") return true;
      if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    }
    // Fallbacks for non-browser contexts.
    const env = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
    if (env && typeof env.DEV === "boolean") return env.DEV;
  } catch {
    /* ignore */
  }
  return false;
})();

// Dev-only logger: prints every dispatched action (navigation + tracked events).
export const devLogger: Middleware =
  () => (next) => (action: unknown) => {
    const a = action as { type?: string; payload?: Record<string, unknown> };
    // Route tracked events into the privacy-safe pipeline (sanitize → opt-in sink).
    if (a.type === "ui/track" && a.payload) {
      captureEvent(a.payload as TrackEvent);
    }
    if (isDevMode) {
      const isEvent = a.type === "ui/track";
      const label = isEvent ? `action:${a.payload?.name}` : a.type;
      // Stringify the payload so it survives the main-process console mirror
      // (objects forward as "[object Object]" otherwise).
      let detail = "";
      try {
        if (a.payload && Object.keys(a.payload).length) {
          detail = " " + JSON.stringify(a.payload);
        }
      } catch {
        /* ignore */
      }
      // eslint-disable-next-line no-console
      console.log(`[openmasq] ${label}${detail}`);
    }
    return next(action);
  };
