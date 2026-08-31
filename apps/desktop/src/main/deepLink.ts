/**
 * Which deep links (scheme: branding `protocol`) this app accepts, and where each one goes.
 *
 * Pure and its own module because it is an ALLOW-LIST on an attacker-reachable surface:
 * any application (or any web page) can get the OS to hand us a deep-link URL, so
 * everything not listed here must be dropped rather than parsed leniently. PKCE gates
 * both code exchanges behind it; this is the layer that decides a URL is even worth
 * looking at. Kept out of `index.ts` so it can be tested — `deepLink.test.ts`.
 */

/** The three callbacks we dispatch. Anything else is not a deep link we know. */
export type DeepLinkHost = "auth" | "billing" | "openrouter";

const HOSTS: readonly string[] = ["auth", "billing", "openrouter"];

/**
 * The host a callback URL targets, or `null` when the URL is not one of ours.
 *
 * ⚠️ `null` means REFUSE. An earlier shape defaulted to `"auth"` for anything
 * unparseable, which is fine for routing a URL already known to be valid, but is the
 * wrong default for a gate: it turned "I don't recognise this" into "treat it as the
 * auth callback".
 */
export function deepLinkTarget(url: string, scheme: string): DeepLinkHost | null {
  try {
    const u = new URL(url);
    if (u.protocol !== `${scheme}:`) return null;
    if (!HOSTS.includes(u.host)) return null;
    if (u.pathname !== "/callback" && u.pathname !== "/callback/") return null;
    return u.host as DeepLinkHost;
  } catch {
    return null;
  }
}

/**
 * Should we register as the handler for the app's URL scheme with the OS?
 *
 * ⚠️ **On macOS, `path`/`args` of `setAsDefaultProtocolClient` are IGNORED (Windows
 * only): it's the running BUNDLE that gets registered.** Unpackaged, that bundle is
 * `node_modules/electron/dist/Electron.app` — a bare Electron. A `pnpm dev` therefore stole the
 * scheme from the installed app, and clicking an email link opened the "To run a local
 * app, execute the following on the command line" screen: the handler pointed at an Electron
 * with no app. Since the LaunchServices registration is PERSISTENT, it survived stopping dev
 * — and with one worktree per session, it was the node_modules of the LAST worktree launched.
 *
 * So: unpackaged macOS ⇒ we don't register, and we DEREGISTER (dev signs in
 * with the CODE received by email, not the link — `apps/desktop/CLAUDE.md`). Windows and Linux
 * keep the dev registration, which there correctly honors execPath + the app entry.
 */
export type ProtocolAction = "register" | "unregister" | "skip";

export function protocolAction(o: {
  packaged: boolean;
  platform: NodeJS.Platform;
  /** The app's path, absolute and existing — otherwise nothing sensible can be declared. */
  devEntry: string | null;
}): ProtocolAction {
  if (o.packaged) return "register";
  if (o.platform === "darwin") return "unregister";
  return o.devEntry ? "register" : "skip";
}
