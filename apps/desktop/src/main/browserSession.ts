import { join } from "node:path";

// Shared browser-identity helpers for the MCP connector OAuth login window
// (src/main/mcp/authWindow.ts). Formerly part of the keyless web-session driver
// (webSession.ts) — that keyless machinery has been removed from the desktop (the
// browser extension owns web sessions now); only these generic login-window
// helpers survive.

// Firefox identity used only for Google traffic during sign-in (Google blocks
// embedded Chromium; Firefox sends no Sec-CH-UA client hints).
export const FIREFOX_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) " +
  "Gecko/20100101 Firefox/128.0";

/** file:// path of the login-window preload (fixes navigator.userAgentData). */
export const LOGIN_PRELOAD = join(__dirname, "../preload/login.js");

/** Anti-fingerprinting preload for the agent browser's NORMAL (isolation-ON) tabs —
 *  injects the cosmetic stealth patches into the main world via `webFrame`. Isolation
 *  and sandbox stay ON; it adds no page capability. See `preload/browserStealth.ts`. */
export const STEALTH_PRELOAD = join(__dirname, "../preload/browserStealth.js");

/** A stable, isolated persistent session partition, keyed by id. */
export function partitionFor(providerId: string): string {
  return `persist:${providerId}`;
}
