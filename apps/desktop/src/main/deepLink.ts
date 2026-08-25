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
 * Faut-il s'enregistrer comme handler du schéma de l'app auprès du système ?
 *
 * ⚠️ **Sur macOS, `path`/`args` de `setAsDefaultProtocolClient` sont IGNORÉS (Windows
 * seulement) : c'est le BUNDLE qui tourne qui est enregistré.** Non packagé, ce bundle est
 * `node_modules/electron/dist/Electron.app` — un Electron nu. Un `pnpm dev` volait donc le
 * schéma à l'app installée, et cliquer le lien d'un e-mail ouvrait l'écran « To run a local
 * app, execute the following on the command line » : le handler pointait sur un Electron
 * sans app. L'enregistrement LaunchServices étant PERSISTANT, ça survivait à l'arrêt du dev
 * — et avec un worktree par session, c'était le node_modules du DERNIER worktree lancé.
 *
 * Donc : macOS non packagé ⇒ on ne s'enregistre pas, et on se DÉSENREGISTRE (le dev signe
 * avec le CODE reçu par e-mail, pas le lien — `apps/desktop/CLAUDE.md`). Windows et Linux
 * gardent l'enregistrement dev, qui y honore bien execPath + l'entrée de l'app.
 */
export type ProtocolAction = "register" | "unregister" | "skip";

export function protocolAction(o: {
  packaged: boolean;
  platform: NodeJS.Platform;
  /** Le chemin de l'app, absolu et existant — sinon on ne peut rien déclarer de sensé. */
  devEntry: string | null;
}): ProtocolAction {
  if (o.packaged) return "register";
  if (o.platform === "darwin") return "unregister";
  return o.devEntry ? "register" : "skip";
}
