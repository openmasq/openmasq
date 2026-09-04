import { isIP } from "node:net";
import { assertPublicUrl, isPrivateIp } from "../../net/net";

/**
 * The URL guards of the agent browser — the scheme check, the synchronous internal-host
 * refusal, and the SSRF floor AT THE SINK (`loadGuarded`). Split out of `agentMain.ts` for
 * the frozen LOC cap (rule 1); `agentMain.ts` is the only consumer besides the tests.
 * Nothing here touches Electron, which is what makes the floor testable without it.
 */
// SCHEME check: only real web origins ever load into an agent tab — never `file://`,
// `data:`, `chrome://`, `devtools://`. It is one PART of the floor, not the floor itself:
// a scheme says nothing about WHERE the request goes, so `loadGuarded` below is what a
// programmatic load must go through.
export function isSafeAgentUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (u === "about:blank") return true;
  return u.startsWith("http://") || u.startsWith("https://");
}

// SYNCHRONOUS pre-check for `will-navigate`/`will-redirect`: rejects a bad scheme, an
// internal hostname, and a LITERAL private IP (a public page 302-ing to 169.254.169.254
// / a LAN IP). A hostname that RESOLVES private is caught by the async re-check below.
export function navUrlBlocked(url: string): boolean {
  if (!isSafeAgentUrl(url)) return true;
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return true;
  }
  if (!host) return false;
  const lower = host.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local"))
    return true;
  if (isIP(host) && isPrivateIp(host)) return true;
  return false;
}

/** The app's own blank page — an internal state, not an egress; never DNS-checked. */
export const isBlankUrl = (url: string): boolean => url.trim().toLowerCase() === "about:blank";

/** The minimal surface a guarded load needs — so the guard is testable without Electron. */
interface LoadTarget {
  isDestroyed(): boolean;
  loadURL(url: string): Promise<void>;
}

/**
 * The SSRF floor AT THE SINK — every programmatic load in this process goes through here.
 *
 * WHY it cannot stay on the events: Electron does NOT fire `will-navigate` /`will-redirect`
 * for a `loadURL` the app itself issues. So `browser:navigate` and `tab-new` — both reachable
 * from the renderer panel — reached Chromium having passed the SCHEME check alone:
 * `http://127.0.0.1:11434`, `http://192.168.1.1/`, `http://printer.local/` all loaded, in a
 * browser that carries the user's logged-in sessions. Attaching the guard to the sink rather
 * than to an event makes it a property of loading, not of how the load was triggered.
 *
 * Fails CLOSED: the sync literal check first, then the async DNS re-check; a refusal loads
 * NOTHING. It never throws — this process talks to the app over a pipe, and a rejection here
 * must refuse the navigation, not become an unhandled error in the IPC.
 */
export function loadGuarded(target: LoadTarget, url: string, onAllow?: () => void): Promise<void> {
  const load = (): void => {
    if (target.isDestroyed()) return;
    onAllow?.();
    void target.loadURL(url);
  };
  if (isBlankUrl(url)) {
    load();
    return Promise.resolve();
  }
  if (navUrlBlocked(url)) {
    console.warn("[agent-browser] refused navigation (scheme/internal host)");
    return Promise.resolve();
  }
  return assertPublicUrl(url, "browser").then(load, () => {
    console.warn("[agent-browser] refused navigation (non-public address)");
  });
}
